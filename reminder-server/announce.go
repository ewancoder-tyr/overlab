package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// An announcement tells every registered device that a new version of the app is out. The
// notification only says so; the list of changes is a page of the app ("What's new"), which a
// tap opens.
//
// Nobody sends one by hand. The app's release notes (src/app/release-notes.json) are copied
// into this service's image when it is built, and the service announces their newest version
// shortly after it starts (see announceRelease). So releasing is: add an entry to that file and
// deploy. A deployment without a new entry notifies nobody, because each version is announced
// once.
type announcement struct {
	// Version identifies the release, e.g. "1.2.0". Each version is announced once.
	Version string
	// Title and Body are the English notice, which every device without a translation gets.
	Title string
	Body  string
	// Translations holds the notice in other languages, keyed by language code ("ru"). Each
	// device is sent the one in its own language.
	Translations map[string]notice
}

// A notice is the text of an announcement in one language.
type notice struct {
	Title string
	Body  string
}

// A release is the part of one entry of the release notes that an announcement needs.
type release struct {
	Version string `json:"version"`
	// Summary is one sentence about the release in every language of the app.
	Summary map[string]string `json:"summary"`
}

// releaseWordings wrap a release in a notice: the title takes the version, the body the
// summary. Like every wording of this service they live here, in every language.
var releaseWordings = map[string]notice{
	"en": {Title: "OverLab %s is out", Body: "%s Tap to see what's new."},
	"ru": {Title: "Вышла OverLab %s", Body: "%s Нажмите, чтобы узнать, что нового."},
}

// announcementOf words the announcement of a release. A language the release has no summary
// in is left out, so its devices get the English notice.
func announcementOf(r release) announcement {
	word := func(language string) notice {
		wording := releaseWordings[language]
		return notice{
			Title: fmt.Sprintf(wording.Title, r.Version),
			Body:  fmt.Sprintf(wording.Body, r.Summary[language]),
		}
	}
	result := announcement{Version: r.Version, Translations: map[string]notice{}}
	result.Title, result.Body = word("en").Title, word("en").Body
	for language := range releaseWordings {
		if language != "en" && strings.TrimSpace(r.Summary[language]) != "" {
			result.Translations[language] = word(language)
		}
	}
	return result
}

// newestRelease reads the release notes, which list every version newest first.
func newestRelease(path string) (release, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return release{}, err
	}
	var releases []release
	if err := json.Unmarshal(data, &releases); err != nil {
		return release{}, err
	}
	if len(releases) == 0 {
		return release{}, errors.New("the release notes list no version")
	}
	newest := releases[0]
	if strings.TrimSpace(newest.Summary["en"]) == "" {
		return release{}, fmt.Errorf("version %q has no English summary", newest.Version)
	}
	return newest, nil
}

// noticeFor picks the text of the announcement for a device's language.
func (a announcement) noticeFor(language string) notice {
	if translated, known := a.Translations[language]; known {
		return translated
	}
	return notice{Title: a.Title, Body: a.Body}
}

// announcementURL is the page of the app that lists the changes of every version.
const announcementURL = "/whats-new"

// A phone that is switched off for the weekend still learns about the update on Monday.
const announcementTTL = 72 * time.Hour

// How long after its start the service announces a new version (see main).
const announceDelay = 2 * time.Minute

func (a announcement) validate() error {
	if err := checkLength("version", a.Version, 40); err != nil {
		return err
	}
	if err := (notice{Title: a.Title, Body: a.Body}).validate(); err != nil {
		return err
	}
	for language, translated := range a.Translations {
		if supportedLanguage(language) == "" {
			return fmt.Errorf("no wordings for the language %q", language)
		}
		if err := translated.validate(); err != nil {
			return fmt.Errorf("%s: %w", language, err)
		}
	}
	return nil
}

func (n notice) validate() error {
	if err := checkLength("title", n.Title, 80); err != nil {
		return err
	}
	return checkLength("body", n.Body, 300)
}

func checkLength(name, value string, limit int) error {
	if strings.TrimSpace(value) == "" || utf8.RuneCountInString(value) > limit {
		return fmt.Errorf("%s needs 1 to %d characters", name, limit)
	}
	return nil
}

type announceResult struct {
	Sent   int
	Failed int
	// AlreadyAnnounced is true when this version, or a newer one, was announced before and
	// nothing was sent.
	AlreadyAnnounced bool
}

// lastAnnounced reads the version announced last, or "" when there was none yet.
func (s *server) lastAnnounced() string {
	data, err := os.ReadFile(s.announcedPath)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// isNewer reports whether version comes after the version announced last. Versions are compared
// number by number ("1.10.0" is newer than "1.9.0"), a missing number counting as 0. With nothing
// announced yet, or a remembered version that cannot be read, every version is new.
func isNewer(version, announced string) bool {
	if announced == "" {
		return true
	}
	next, last := strings.Split(version, "."), strings.Split(announced, ".")
	for i := 0; i < max(len(next), len(last)); i++ {
		a, b := 0, 0
		var errA, errB error
		if i < len(next) {
			a, errA = strconv.Atoi(next[i])
		}
		if i < len(last) {
			b, errB = strconv.Atoi(last[i])
		}
		if errA != nil || errB != nil {
			return version != announced
		}
		if a != b {
			return a > b
		}
	}
	return false
}

// announce sends the announcement to every device, once per version: every start of the
// service calls it, but only a start that brings a newer version may notify anyone. A restart
// announces nothing again, and neither does rolling back to an older version.
func (s *server) announce(ctx context.Context, a announcement) (announceResult, error) {
	if err := a.validate(); err != nil {
		return announceResult{}, err
	}
	if !isNewer(a.Version, s.lastAnnounced()) {
		return announceResult{AlreadyAnnounced: true}, nil
	}
	// Remembered BEFORE sending: if the service stops halfway, some devices miss the news,
	// which is better than every device getting it twice on the next start.
	if err := os.WriteFile(s.announcedPath, []byte(a.Version+"\n"), 0o600); err != nil {
		return announceResult{}, fmt.Errorf("could not remember the announced version: %w", err)
	}

	var result announceResult
	for _, device := range s.store.All() {
		text := a.noticeFor(device.Language)
		message := Message{
			Title: text.Title,
			Body:  text.Body,
			Tag:   "app-update",
			URL:   announcementURL,
			TTL:   announcementTTL,
		}
		err := s.push(ctx, device, message)
		switch {
		case errors.Is(err, errGone):
			_ = s.store.Delete(device.Endpoint)
		case err != nil:
			log.Printf("announcement failed for a device: %v", err)
			result.Failed++
		default:
			result.Sent++
		}
	}
	return result, nil
}

// announceRelease announces the newest version of the release notes at path, unless it or a
// newer one was announced before. Run once when the service starts. A service built without
// release notes (run from source, say) has nothing to announce, which is not an error.
func (s *server) announceRelease(ctx context.Context, path string) {
	newest, err := newestRelease(path)
	if errors.Is(err, os.ErrNotExist) {
		return
	}
	if err != nil {
		log.Printf("release notes at %s: %v", path, err)
		return
	}
	result, err := s.announce(ctx, announcementOf(newest))
	switch {
	case err != nil:
		log.Printf("version %s was not announced: %v", newest.Version, err)
	case !result.AlreadyAnnounced:
		log.Printf("announced version %s to %d device(s), %d failed", newest.Version, result.Sent, result.Failed)
	}
}
