package leaderboard

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	// The same pure-Go SQLite driver as cloudsync (see cloudsync/store.go).
	_ "modernc.org/sqlite"
)

// Store holds one row per account that joined the leaderboard: what Google shows for it and the
// experience its devices last reported. An account without a row has not joined.
//
// It also holds what buddies need (see buddies.go): who follows whom, and where to push to.
type Store struct {
	db *sql.DB
}

const schema = `
CREATE TABLE IF NOT EXISTS entries (
	sub       TEXT PRIMARY KEY,  -- the Google account id; never sent to other users
	name      TEXT NOT NULL,     -- from the ID token at joining; may be empty
	picture   TEXT NOT NULL,     -- a Google image URL, or empty
	xp        INTEGER NOT NULL,  -- whole experience points, as the app reported them
	joined_at INTEGER NOT NULL,  -- unix seconds; breaks ties in favour of the earlier one
	public_id TEXT NOT NULL DEFAULT ''  -- a random name for the row, safe to show to other users
);

-- One row per "follower follows followed", both Google account ids. A follow alone does
-- nothing and is shown to nobody but the follower; two that meet make buddies.
CREATE TABLE IF NOT EXISTS follows (
	follower TEXT NOT NULL,
	followed TEXT NOT NULL,
	PRIMARY KEY (follower, followed)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS follows_followed ON follows (followed);

-- Where to push a buddy's sets to: the push subscriptions of an account's devices.
CREATE TABLE IF NOT EXISTS devices (
	endpoint     TEXT PRIMARY KEY,           -- the push service URL of one device
	sub          TEXT NOT NULL,              -- the account signed in on it
	p256dh       TEXT NOT NULL,
	auth         TEXT NOT NULL,
	language     TEXT NOT NULL,              -- the app's language there, or empty
	last_wording INTEGER NOT NULL DEFAULT 0, -- the wording used last, plus one; 0 is none yet
	seen_at      INTEGER NOT NULL            -- unix seconds of the latest registration
);
CREATE INDEX IF NOT EXISTS devices_sub ON devices (sub);
`

const (
	// MaxFollows is how many others one account may follow.
	MaxFollows = 20
	// maxDevices is how many push subscriptions one account keeps; the oldest goes first.
	maxDevices = 10
)

var (
	errNotJoined   = errors.New("not on the leaderboard")
	errNoSuchEntry = errors.New("nobody on the leaderboard has this id")
	errSelf        = errors.New("following yourself")
	errTooMany     = errors.New("too many follows")
)

// OpenStore opens (or creates) the database file.
func OpenStore(path string) (*Store, error) {
	db, err := sql.Open("sqlite", "file:"+path+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // One writer at a time, as in cloudsync.
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("creating the schema: %w", err)
	}
	if err := addPublicIDs(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("naming the rows: %w", err)
	}
	return &Store{db: db}, nil
}

// addPublicIDs brings a database from before buddies up to date: CREATE TABLE IF NOT EXISTS
// leaves an existing table as it was, so the column is added here, and every row that has no
// public id yet gets one.
func addPublicIDs(db *sql.DB) error {
	var has int
	if err := db.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'public_id'`).Scan(&has); err != nil {
		return err
	}
	if has == 0 {
		if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN public_id TEXT NOT NULL DEFAULT ''`); err != nil {
			return err
		}
	}
	rows, err := db.Query(`SELECT sub FROM entries WHERE public_id = ''`)
	if err != nil {
		return err
	}
	var unnamed []string
	for rows.Next() {
		var sub string
		if err := rows.Scan(&sub); err != nil {
			_ = rows.Close()
			return err
		}
		unnamed = append(unnamed, sub)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, sub := range unnamed {
		if _, err := db.Exec(`UPDATE entries SET public_id = ? WHERE sub = ?`, newPublicID(), sub); err != nil {
			return err
		}
	}
	return nil
}

// newPublicID is a random name for a row of the board. Other users see it (to say whom they
// follow), so it must reveal nothing about the Google account behind it.
func newPublicID() string {
	bytes := make([]byte, 16)
	// crypto/rand.Read never fails on the platforms Go supports; it panics instead.
	_, _ = rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func (s *Store) Close() error { return s.db.Close() }

// Entry is one row of the board as other users see it: no account id.
type Entry struct {
	// ID is the row's public id: what the app sends back to follow this row.
	ID      string
	Name    string
	Picture string
	XP      int64
	// You is true on the row of the account that asked.
	You bool
	// Following is true when the account that asked follows this row. Whether this row
	// follows back is never said (see buddies.go).
	Following bool
}

// Join adds the account, or refreshes its name and picture when it is already on the board
// (joining again from another device, or after changing the Google photo). Joining again keeps
// the original joining time, so it does not lose a tie.
func (s *Store) Join(ctx context.Context, sub, name, picture string, xp int64, now time.Time) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO entries (sub, name, picture, xp, joined_at, public_id) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (sub) DO UPDATE SET name = excluded.name, picture = excluded.picture, xp = excluded.xp`,
		sub, name, picture, xp, now.Unix(), newPublicID())
	return err
}

// SetXP records the account's latest experience. It answers false when the account has not
// joined: reporting experience never puts anyone on the board.
func (s *Store) SetXP(ctx context.Context, sub string, xp int64) (bool, error) {
	result, err := s.db.ExecContext(ctx, `UPDATE entries SET xp = ? WHERE sub = ?`, xp, sub)
	if err != nil {
		return false, err
	}
	changed, err := result.RowsAffected()
	return changed > 0, err
}

// Leave removes the account from the board, and with it everything buddies kept: its follows
// in both directions and its devices. Leaving when not on it is not an error.
func (s *Store) Leave(ctx context.Context, sub string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }() // Does nothing once committed.
	for _, statement := range []string{
		`DELETE FROM entries WHERE sub = ?`,
		`DELETE FROM follows WHERE follower = ?`,
		`DELETE FROM follows WHERE followed = ?`,
		`DELETE FROM devices WHERE sub = ?`,
	} {
		if _, err := tx.ExecContext(ctx, statement, sub); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Board returns everyone on the board, most experience first, and whether `sub` is on it.
func (s *Store) Board(ctx context.Context, sub string) ([]Entry, bool, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT sub, public_id, name, picture, xp,
			EXISTS (SELECT 1 FROM follows WHERE follower = ? AND followed = entries.sub)
		 FROM entries ORDER BY xp DESC, joined_at, sub`, sub)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()

	entries := []Entry{}
	joined := false
	for rows.Next() {
		var entry Entry
		var owner string
		if err := rows.Scan(&owner, &entry.ID, &entry.Name, &entry.Picture, &entry.XP, &entry.Following); err != nil {
			return nil, false, err
		}
		entry.You = owner == sub
		joined = joined || entry.You
		entries = append(entries, entry)
	}
	return entries, joined, rows.Err()
}

// Follow records that `follower` follows the row named `publicID`. Following someone already
// followed changes nothing.
func (s *Store) Follow(ctx context.Context, follower, publicID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var joined int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM entries WHERE sub = ?`, follower).Scan(&joined); err != nil {
		return err
	}
	if joined == 0 {
		return errNotJoined
	}
	var followed string
	err = tx.QueryRowContext(ctx,
		`SELECT sub FROM entries WHERE public_id = ? AND public_id != ''`, publicID).Scan(&followed)
	if errors.Is(err, sql.ErrNoRows) {
		return errNoSuchEntry
	}
	if err != nil {
		return err
	}
	if followed == follower {
		return errSelf
	}
	var count, already int
	if err := tx.QueryRowContext(ctx, `
		SELECT COUNT(*), COALESCE(SUM(followed = ?), 0) FROM follows WHERE follower = ?`,
		followed, follower).Scan(&count, &already); err != nil {
		return err
	}
	if already == 0 && count >= MaxFollows {
		return errTooMany
	}
	if _, err := tx.ExecContext(ctx,
		`INSERT OR IGNORE INTO follows (follower, followed) VALUES (?, ?)`, follower, followed); err != nil {
		return err
	}
	return tx.Commit()
}

// Unfollow removes the follow. Unfollowing a row that is gone, or was never followed, is not
// an error: not following it is what was wanted.
func (s *Store) Unfollow(ctx context.Context, follower, publicID string) error {
	_, err := s.db.ExecContext(ctx, `
		DELETE FROM follows
		WHERE follower = ? AND followed IN (SELECT sub FROM entries WHERE public_id = ?)`,
		follower, publicID)
	return err
}

// PushDevice is one device of an account, as the push needs it.
type PushDevice struct {
	Subscription
	Language string
	// LastWording is the wording used last on this device, plus one; 0 means none yet.
	LastWording int
}

// SaveDevice records where to push for an account that is on the board (errNotJoined
// otherwise). A device that signs in to another account moves to it. An account keeps its
// latest few devices.
func (s *Store) SaveDevice(ctx context.Context, sub string, device PushDevice, now time.Time) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var joined int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM entries WHERE sub = ?`, sub).Scan(&joined); err != nil {
		return err
	}
	if joined == 0 {
		return errNotJoined
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO devices (endpoint, sub, p256dh, auth, language, seen_at) VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (endpoint) DO UPDATE SET sub = excluded.sub, p256dh = excluded.p256dh,
			auth = excluded.auth, language = excluded.language, seen_at = excluded.seen_at`,
		device.Endpoint, sub, device.P256dh, device.Auth, device.Language, now.Unix()); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM devices WHERE sub = ? AND endpoint NOT IN (
			SELECT endpoint FROM devices WHERE sub = ? ORDER BY seen_at DESC, endpoint LIMIT ?)`,
		sub, sub, maxDevices); err != nil {
		return err
	}
	return tx.Commit()
}

// DeleteDevice forgets one device of the account.
func (s *Store) DeleteDevice(ctx context.Context, sub, endpoint string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM devices WHERE sub = ? AND endpoint = ?`, sub, endpoint)
	return err
}

// DropDevice forgets a device whose subscription the push service says is gone.
func (s *Store) DropDevice(ctx context.Context, endpoint string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM devices WHERE endpoint = ?`, endpoint)
	return err
}

// MarkWording remembers the wording a device just got, so its next one differs.
func (s *Store) MarkWording(ctx context.Context, endpoint string, wording int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE devices SET last_wording = ? WHERE endpoint = ?`, wording+1, endpoint)
	return err
}

// Member is what is said about whoever did the set: the name and the row's public id.
func (s *Store) Member(ctx context.Context, sub string) (name, publicID string, joined bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT name, public_id FROM entries WHERE sub = ?`, sub).Scan(&name, &publicID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", "", false, nil
	}
	return name, publicID, err == nil, err
}

// BuddyDevices returns the devices of the account's buddies: of everyone it follows who
// follows it back. This join is the whole consent rule: a follow in one direction only
// matches nothing.
func (s *Store) BuddyDevices(ctx context.Context, sub string) ([]PushDevice, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT d.endpoint, d.p256dh, d.auth, d.language, d.last_wording
		FROM follows mine
		JOIN follows theirs ON theirs.follower = mine.followed AND theirs.followed = mine.follower
		JOIN devices d ON d.sub = mine.followed
		WHERE mine.follower = ?
		ORDER BY d.endpoint`, sub)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []PushDevice
	for rows.Next() {
		var device PushDevice
		if err := rows.Scan(&device.Endpoint, &device.P256dh, &device.Auth, &device.Language, &device.LastWording); err != nil {
			return nil, err
		}
		devices = append(devices, device)
	}
	return devices, rows.Err()
}
