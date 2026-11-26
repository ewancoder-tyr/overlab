package cloudsync

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"

	// Registers the "sqlite" driver with database/sql. It is SQLite translated to pure Go, so the
	// binary still builds with CGO off and runs in a minimal image with no C library.
	_ "modernc.org/sqlite"
)

// Store is the cloud copy: every account's events, as opaque JSON.
//
// The server never reads an event's contents. It only needs an event's id, to ignore duplicates
// (a device retries a push after a timeout, two devices push the same pulled event), and a
// sequence number, so a device can ask "what has arrived since I last looked?".
type Store struct {
	db *sql.DB
}

// errWrongGeneration means the device is behind a "Delete everything": the copy it knew is gone.
var errWrongGeneration = errors.New("the cloud copy was deleted since this device last synced")

// errNoAccount means the cookie names an account the database does not hold.
var errNoAccount = errors.New("no such account")

// errAccountFull means a push would take an account over maxEventsPerAccount.
var errAccountFull = errors.New("the account has too many events")

// maxEventsPerAccount keeps one account from filling the disk. A heavy user logs a few thousand
// events a year, so this is decades of training.
const maxEventsPerAccount = 200_000

const schema = `
CREATE TABLE IF NOT EXISTS accounts (
	sub        TEXT PRIMARY KEY,         -- the Google account id, from the ID token
	generation INTEGER NOT NULL          -- bumped by "Delete everything"
);
CREATE TABLE IF NOT EXISTS events (
	seq  INTEGER PRIMARY KEY AUTOINCREMENT, -- the pull cursor; only ever grows
	sub  TEXT NOT NULL,
	id   TEXT NOT NULL,
	body BLOB NOT NULL,
	UNIQUE (sub, id)
);
`

// OpenStore opens (or creates) the database file.
func OpenStore(path string) (*Store, error) {
	// WAL lets reads run while a write is in progress; busy_timeout makes a second writer wait
	// briefly instead of failing at once.
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	// SQLite allows one writer at a time. One connection makes database/sql queue writes
	// instead of letting them collide, and at this scale it costs nothing.
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("creating the schema: %w", err)
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// Generation returns the account's generation, creating the account at generation 1.
func (s *Store) Generation(ctx context.Context, sub string) (int64, error) {
	if _, err := s.db.ExecContext(ctx,
		`INSERT INTO accounts (sub, generation) VALUES (?, 1) ON CONFLICT (sub) DO NOTHING`, sub); err != nil {
		return 0, err
	}
	var generation int64
	err := s.db.QueryRowContext(ctx, `SELECT generation FROM accounts WHERE sub = ?`, sub).Scan(&generation)
	return generation, err
}

// Event is one stored event: its id and its JSON exactly as the device sent it.
type Event struct {
	ID   string
	Body json.RawMessage
}

// Append stores events the account does not have yet. It fails with errWrongGeneration when the
// device's generation is not the current one, so a device that missed a "Delete everything"
// cannot push the deleted history back.
func (s *Store) Append(ctx context.Context, sub string, generation int64, events []Event) error {
	// One transaction: the generation check and the inserts see the same state, and a push is
	// stored completely or not at all.
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }() // A no-op after Commit.

	if err := checkGeneration(ctx, tx, sub, generation); err != nil {
		return err
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM events WHERE sub = ?`, sub).Scan(&count); err != nil {
		return err
	}
	if count+len(events) > maxEventsPerAccount {
		return errAccountFull
	}
	for _, event := range events {
		// An event already stored is skipped: events are immutable, so it is the same event.
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO events (sub, id, body) VALUES (?, ?, ?) ON CONFLICT (sub, id) DO NOTHING`,
			sub, event.ID, []byte(event.Body)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Page is one answer to a pull.
type Page struct {
	Events []json.RawMessage
	// Cursor is what to pass as `after` next time.
	Cursor int64
	// More is true when the page was cut at the limit and the device should ask again at once.
	More bool
}

// After returns up to `limit` events stored after `cursor`, oldest first.
func (s *Store) After(ctx context.Context, sub string, generation, cursor int64, limit int) (Page, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return Page{}, err
	}
	defer func() { _ = tx.Rollback() }()

	if err := checkGeneration(ctx, tx, sub, generation); err != nil {
		return Page{}, err
	}
	// One more row than asked for tells us whether there is another page.
	rows, err := tx.QueryContext(ctx,
		`SELECT seq, body FROM events WHERE sub = ? AND seq > ? ORDER BY seq LIMIT ?`, sub, cursor, limit+1)
	if err != nil {
		return Page{}, err
	}
	defer rows.Close()

	page := Page{Events: []json.RawMessage{}, Cursor: cursor}
	for rows.Next() {
		if len(page.Events) == limit {
			page.More = true
			break
		}
		var body []byte
		if err := rows.Scan(&page.Cursor, &body); err != nil {
			return Page{}, err
		}
		page.Events = append(page.Events, body)
	}
	return page, rows.Err()
}

// DeleteEverything removes all of the account's events and bumps its generation, which tells
// every other device of the account to erase its own copy when it next syncs. The account row
// itself stays: without it the generation would restart at 1 and old devices would not notice.
func (s *Store) DeleteEverything(ctx context.Context, sub string) (int64, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM events WHERE sub = ?`, sub); err != nil {
		return 0, err
	}
	var generation int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO accounts (sub, generation) VALUES (?, 2)
		ON CONFLICT (sub) DO UPDATE SET generation = generation + 1
		RETURNING generation`, sub).Scan(&generation)
	if err != nil {
		return 0, err
	}
	return generation, tx.Commit()
}

// generationError carries the current generation, which the device needs to start over with.
type generationError struct{ current int64 }

func (e generationError) Error() string        { return errWrongGeneration.Error() }
func (e generationError) Is(target error) bool { return target == errWrongGeneration }

func checkGeneration(ctx context.Context, tx *sql.Tx, sub string, generation int64) error {
	var current int64
	err := tx.QueryRowContext(ctx, `SELECT generation FROM accounts WHERE sub = ?`, sub).Scan(&current)
	if errors.Is(err, sql.ErrNoRows) {
		// Only sign-in creates accounts, so this is a valid cookie for an account the server
		// does not have (a database restored from an older backup). Signing in again fixes it.
		return errNoAccount
	} else if err != nil {
		return err
	}
	if current != generation {
		return generationError{current: current}
	}
	return nil
}
