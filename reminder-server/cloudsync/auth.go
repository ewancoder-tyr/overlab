package cloudsync

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Signing in happens once per device:
//
//  1. Google's sign-in button gives the app an ID token: a JWT signed by Google that says
//     "this is Google account <sub>, and it was issued to OverLab's client id".
//  2. The app posts it here once. We check Google's signature and that it was meant for us.
//  3. We answer with our own cookie holding that sub, signed with our secret, valid for a year.
//
// From then on every request carries the cookie, so the app never handles a token again and a
// device stays signed in without Google's script running. The cookie is HttpOnly (page scripts
// cannot read it) and SameSite=Strict (other sites cannot make the browser send it).

const (
	cookieName     = "overlab_sync"
	cookieLifetime = 365 * 24 * time.Hour
)

// Identity is who a verified ID token is for. Sync uses only Sub; Name and Picture are what
// Google shows for the account, read by the leaderboard and never stored by sync.
type Identity struct {
	Sub     string
	Name    string
	Picture string
}

// VerifyIDToken checks a Google ID token and returns who it is for.
type VerifyIDToken func(ctx context.Context, token string) (Identity, error)

// GoogleVerifier checks ID tokens against Google's public keys, which it downloads on first use
// and refreshes when Google rotates them.
func GoogleVerifier(clientID string) VerifyIDToken {
	keys := oidc.NewRemoteKeySet(context.Background(), "https://www.googleapis.com/oauth2/v3/certs")
	// Google issues tokens with either form of its issuer, so we check it ourselves below.
	verifier := oidc.NewVerifier("https://accounts.google.com", keys,
		&oidc.Config{ClientID: clientID, SkipIssuerCheck: true})
	return func(ctx context.Context, token string) (Identity, error) {
		// Verify checks the signature, the expiry and that the audience is our client id.
		idToken, err := verifier.Verify(ctx, token)
		if err != nil {
			return Identity{}, err
		}
		if idToken.Issuer != "https://accounts.google.com" && idToken.Issuer != "accounts.google.com" {
			return Identity{}, fmt.Errorf("unexpected issuer %q", idToken.Issuer)
		}
		if idToken.Subject == "" {
			return Identity{}, errors.New("the token names no account")
		}
		// The profile claims are signed with the rest, so they cannot be forged either. They
		// are absent when the account shares no profile, which leaves the fields empty.
		var profile struct {
			Name    string `json:"name"`
			Picture string `json:"picture"`
		}
		_ = idToken.Claims(&profile)
		return Identity{Sub: idToken.Subject, Name: profile.Name, Picture: profile.Picture}, nil
	}
}

// cookieSigner makes and checks session cookies. There is no session table: the cookie itself
// says who it is for and until when, and the signature proves we wrote it.
type cookieSigner struct {
	secret []byte
}

// value is "<sub>.<expiry as unix seconds>.<signature>". A sub is digits only, so the dots are
// unambiguous; the signature is URL-safe base64, which has no dots either.
func (c cookieSigner) value(sub string, expires time.Time) string {
	payload := sub + "." + strconv.FormatInt(expires.Unix(), 10)
	return payload + "." + c.sign(payload)
}

// subject returns the account a cookie value is for, if it is ours and has not expired.
func (c cookieSigner) subject(value string, now time.Time) (string, bool) {
	cut := strings.LastIndexByte(value, '.')
	if cut < 0 {
		return "", false
	}
	payload, signature := value[:cut], value[cut+1:]
	// Constant-time comparison: a plain == would leak, through timing, how many leading
	// characters of a forged signature were right.
	if !hmac.Equal([]byte(signature), []byte(c.sign(payload))) {
		return "", false
	}
	sub, expiry, found := strings.Cut(payload, ".")
	if !found {
		return "", false
	}
	seconds, err := strconv.ParseInt(expiry, 10, 64)
	if err != nil || now.Unix() >= seconds {
		return "", false
	}
	return sub, true
}

func (c cookieSigner) sign(payload string) string {
	mac := hmac.New(sha256.New, c.secret)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// loadOrCreateSecret reads the cookie secret, creating a random one the first time. Losing the
// file signs every device out, nothing worse: their data is still in the database.
func loadOrCreateSecret(path string) ([]byte, error) {
	if secret, err := os.ReadFile(path); err == nil && len(secret) >= 32 {
		return secret, nil
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return secret, os.WriteFile(path, secret, 0o600)
}
