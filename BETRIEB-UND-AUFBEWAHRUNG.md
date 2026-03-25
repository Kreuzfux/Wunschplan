## Betrieb & Aufbewahrung (Checkliste)

### Backup / Wiederherstellung
- **Datenbank-Backups**: täglich (oder häufiger, je nach Betrieb) aktivieren.
- **Wiederherstellung testen**: mindestens **quartalsweise** eine Restore-Probe (Staging/Local) durchführen und protokollieren.
- **Exports**: nach **jedem** Publizieren PDF/Excel als externes Backup ablegen.
- **Verantwortlich**: Admin (Pflegedienstleitung) benennt einen Stellvertreter für Backup/Restore.

### Aufbewahrung (Retention)
- **Nachweisziel**: **3 Jahre** Aufbewahrung (orientiert an **§195 BGB** – allgemeine Verjährungsfrist).
- **Dienstpläne (`schedule_assignments`)**: **mindestens 3 Jahre** aufbewahren (betriebliche Nachweise).
- **Monate (`monthly_plans`)**: **mindestens 3 Jahre** aufbewahren (Status/Team/Monat).
- **Audit-Log (`audit_log`)**: **mindestens 3 Jahre** aufbewahren (Wer hat was wann getan).
- **Wünsche (`shift_wishes`)**: nur so lange wie nötig (z. B. 6–12 Monate) – danach löschen/anonymisieren.
- **Verantwortlich**: Admin definiert den Stichtag (z. B. Ende Kalenderjahr + 3 Jahre) und dokumentiert die Löschroutine.

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

