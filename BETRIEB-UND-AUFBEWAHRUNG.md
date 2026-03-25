## Betrieb & Aufbewahrung (Checkliste)

### Backup / Wiederherstellung
- **Datenbank-Backups**: Supabase Projekt so konfigurieren, dass regelmäßige Backups aktiv sind.
- **Wiederherstellung testen**: mindestens quartalsweise einmal Restore-Probe (Staging/Local) durchführen.
- **Exports**: Monatlich nach Publizieren zusätzlich PDF/Excel als externes Backup ablegen.

### Aufbewahrung (Retention)
- **Dienstpläne (`schedule_assignments`)**: mindestens 2–3 Jahre aufbewahren (betriebliche Nachweise).
- **Wünsche (`shift_wishes`)**: nur so lange wie nötig (z. B. 6–12 Monate) – danach löschen/anonymisieren.
- **Audit-Log (`audit_log`)**: z. B. 12–36 Monate (abhängig von interner Policy).

### Zugriffs- & Rollenmodell
- **Admin**: global, kann Teams/Benutzer verwalten und veröffentlichen.
- **Superuser**: nur Team-scope, kann teambezogene Monate verwalten und teambezogene Mitarbeiter löschen/anonymisieren.
- **Mitarbeiter**: kann im offenen Monat Wünsche abgeben und im veröffentlichten Monat eigenen Dienstplan sehen.

### Edge Functions & Secrets
- **Secrets**: `SUPABASE_SERVICE_ROLE_KEY` nur als Edge-Secret setzen, niemals im Frontend.
- **JWT-Verifikation**: Falls `--no-verify-jwt` genutzt wird, muss die Function den JWT selbst strikt prüfen.
- **Logs**: keine JWTs/PII in Logs schreiben.

### Datenschutz (Kurz)
- **Löschen (Option B)**: Auth-User entfernen, Profil anonymisieren/deaktivieren, persönliche Wunschdaten löschen; historische Planung bleibt ohne PII.
- **Exporte prüfen**: keine E-Mail/Telefonnummern im PDF/Excel.

### Monitoring
- **Edge Function Fehler**: 5xx beobachten (Dashboard).
- **Berechtigungsfehler**: häufige 401/403 als Hinweis auf Token/Secret-Drift.

