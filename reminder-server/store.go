package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// A Device is one installed copy of the app that asked for reminders. There are no user
// accounts: the push subscription the browser created is the device's identity, and its
// unguessable endpoint URL doubles as the key that lets the app change or remove this record.
type Device struct {
	// Endpoint is the push service URL for this device (Google's FCM for Chrome on Android).
	Endpoint string `json:"endpoint"`
	// P256dh and Auth are the device's public key and shared secret. Push messages are
	// encrypted with them, so the push service in the middle cannot read what we send.
	P256dh   string   `json:"p256dh"`
	Auth     string   `json:"auth"`
	Reminder Reminder `json:"reminder"`
	// Hype holds a few headline numbers for the user's next planned workout, for the reminder text.
	Hype []HypeFact `json:"hype,omitempty"`
	// Language is the app's language on this device ("en", "ru"): reminders and "new version"
	// notices are written in it. Empty for a device that registered none, which gets English.
	Language string `json:"language,omitempty"`
	// LastSentDate is the local date (YYYY-MM-DD) of the last reminder sent.
	LastSentDate string `json:"lastSentDate,omitempty"`
	// Solo holds the alarms for single exercises done outside workouts (see solo.go). Each
	// carries its own "last sent" date.
	Solo []SoloReminder `json:"solo,omitempty"`
	// Programs holds one reminder per program (see programs.go). Each carries its own "last
	// sent" date.
	Programs []ProgramReminder `json:"programs,omitempty"`
	// LastWording is the index of the wording used last, so the next one differs. It is
	// stored plus one, so that the zero value of a new device means "none yet".
	LastWording int `json:"lastWording,omitempty"`
}

// maxDevices caps the file: the API is open, so something must stop it growing without bound.
const maxDevices = 10000

var errStoreFull = errors.New("too many registered devices")

// Store keeps the devices in memory and mirrors them to one JSON file. A database would be
// overkill for a few hundred small records that change a handful of times a day.
type Store struct {
	path string
	// The mutex guards `devices`: HTTP handlers and the scheduler run on different goroutines.
	mu      sync.Mutex
	devices map[string]Device // keyed by endpoint
}

func OpenStore(path string) (*Store, error) {
	store := &Store{path: path, devices: map[string]Device{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, nil // First start: nothing saved yet.
	}
	if err != nil {
		return nil, err
	}
	var devices []Device
	if err := json.Unmarshal(data, &devices); err != nil {
		return nil, err
	}
	for _, device := range devices {
		store.devices[device.Endpoint] = device
	}
	return store, nil
}

// save writes the file atomically: to a temporary file first, then a rename over the real one,
// so a crash in the middle can never leave a half-written file. Callers hold the mutex.
func (s *Store) save() error {
	devices := make([]Device, 0, len(s.devices))
	for _, device := range s.devices {
		devices = append(devices, device)
	}
	data, err := json.MarshalIndent(devices, "", "  ")
	if err != nil {
		return err
	}
	temporary := s.path + ".tmp"
	// 0600: readable by this service only. The file holds push credentials.
	if err := os.WriteFile(temporary, data, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, filepath.Clean(s.path))
}

// Upsert adds a device or replaces its reminder. `sentDate`, when not empty, marks that day as
// already notified; otherwise an existing device keeps its mark. Program and solo reminders keep
// their own marks (see carryProgramSent), for which `now` is needed.
func (s *Store) Upsert(device Device, sentDate string, now time.Time) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, known := s.devices[device.Endpoint]
	if !known && len(s.devices) >= maxDevices {
		return errStoreFull
	}
	device.LastSentDate = existing.LastSentDate
	device.LastWording = existing.LastWording
	if sentDate != "" {
		device.LastSentDate = sentDate
	}
	device.Solo = carrySoloSent(existing.Solo, device.Solo, device.Reminder.TimeZone, now)
	device.Programs = carryProgramSent(existing.Programs, device.Programs, device.Reminder.TimeZone, now)
	s.devices[device.Endpoint] = device
	return s.save()
}

func (s *Store) Delete(endpoint string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, known := s.devices[endpoint]; !known {
		return nil
	}
	delete(s.devices, endpoint)
	return s.save()
}

func (s *Store) Get(endpoint string) (Device, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	device, known := s.devices[endpoint]
	return device, known
}

// All returns a copy, so the caller can work through it without holding the lock.
func (s *Store) All() []Device {
	s.mu.Lock()
	defer s.mu.Unlock()

	devices := make([]Device, 0, len(s.devices))
	for _, device := range s.devices {
		devices = append(devices, device)
	}
	return devices
}

// MarkSent records that `endpoint` was sent wording number `wording`, and, when `date` is not
// empty, that it was the reminder for that day (a test notification passes no date).
func (s *Store) MarkSent(endpoint, date string, wording int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	device, known := s.devices[endpoint]
	if !known {
		return nil
	}
	if date != "" {
		device.LastSentDate = date
	}
	device.LastWording = wording + 1
	s.devices[endpoint] = device
	return s.save()
}

// MarkSoloSent records that the solo reminder `id` of `endpoint` rang on `date`, with wording
// number `wording`. The wording is remembered per device, not per alarm, so the same roast never
// comes twice in a row whatever it was about.
func (s *Store) MarkSoloSent(endpoint, id, date string, wording int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	device, known := s.devices[endpoint]
	if !known {
		return nil
	}
	// A copy, because the slice is shared with whatever All() or Get() handed out earlier.
	solo := make([]SoloReminder, len(device.Solo))
	copy(solo, device.Solo)
	for index := range solo {
		if solo[index].ID == id {
			solo[index].LastSentDate = date
		}
	}
	device.Solo = solo
	device.LastWording = wording + 1
	s.devices[endpoint] = device
	return s.save()
}

// MarkProgramSent records that the reminder of program `id` of `endpoint` was sent with wording
// number `wording` and, when `date` is not empty, that it was the one for that day (a test
// notification passes no date). The wording is remembered per device, not per program, so the
// same roast never comes twice in a row whatever it was about.
func (s *Store) MarkProgramSent(endpoint, id, date string, wording int) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	device, known := s.devices[endpoint]
	if !known {
		return nil
	}
	// A copy, because the slice is shared with whatever All() or Get() handed out earlier.
	programs := make([]ProgramReminder, len(device.Programs))
	copy(programs, device.Programs)
	for index := range programs {
		if programs[index].ID == id && date != "" {
			programs[index].LastSentDate = date
		}
	}
	device.Programs = programs
	device.LastWording = wording + 1
	s.devices[endpoint] = device
	return s.save()
}
