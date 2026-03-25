# Wunschplan - Bedienungsanleitung

Diese Anwendung dient zur Wunschdienstplanung und Schichtverwaltung im Pflegedienst.

## App aufrufen

- URL: `https://kreuzfux.github.io/Wunschplan/`
- Anmeldung: `/#/login`
- Registrierung: `/#/register`

## Rollen

- **Mitarbeiter**: Wunschdienste eintragen und einreichen.
- **Superuser**: Team-Admin (teambezogen): Monate für das eigene Team anlegen/löschen, Schichten/Abgaben/Limits teambezogen verwalten.
- **Admin**: Vollzugriff (global): Teams/Benutzer verwalten, Monate verwalten, Dienstplan generieren, publizieren und exportieren.

## Anmeldung und Registrierung

- Registriere dich mit Name, E-Mail und Passwort.
- Nach der Registrierung E-Mail bestaetigen (falls aktiv).
- Anschliessend auf der Login-Seite anmelden.

### Wenn Login klemmt

- Auf der Login-Seite den Button **Lokale Daten zuruecksetzen** klicken.
- Danach neu anmelden.
- Die App zeigt eine Rueckmeldung an, wenn die Daten erfolgreich zurueckgesetzt wurden.

## Profil (Name, E-Mail, Profilbild)

- Über den Button **Profil** im Header kannst du:
  - deinen Namen ändern,
  - deine Login-E-Mail ändern (mit Bestätigung),
  - ein Profilbild (max. 5 MB, JPG/PNG/WEBP) hochladen.

## Mitarbeiter: Wunschplan eintragen

1. Dashboard oeffnen.
2. Oben den Monat auswaehlen (alle Monate deines Teams sind sichtbar).
3. Tag im Monatskalender anklicken (nur bei Status `open`).
3. Bemerkung eintragen (z. B. "ab 12 Uhr", "nur mit Fuehrerschein").
4. **Wunsch speichern** klicken.
5. Wenn alles fertig ist: **Wunschplan einreichen**.

## Mitarbeiter: Dienstplan sehen (nach Publizieren)

- Wenn ein Monat den Status **published** hat, siehst du im Mitarbeiterbereich deinen Abschnitt **„Dein Dienstplan“**.
- Du siehst nur deine eigenen Zuteilungen (teambezogen).

## Admin: Monatsplan verwalten

1. Admin-Bereich oeffnen (`/#/admin`).
2. Team wählen (Admin: optional, Superuser: fest).
3. **Monat anlegen**.
3. Status auf **open** setzen.
4. Abgabestatus der Mitarbeiter pruefen.
5. **Generieren** klicken, um den Dienstplan automatisch zu erstellen.
6. Bei Bedarf manuell anpassen.
7. Status auf **published** setzen.

### Generierung mit Limits

- Pro Mitarbeiter kann eine maximale Anzahl Schichten pro Monat gepflegt werden.
- Die Generierung berücksichtigt das Limit; wenn Slots offen bleiben, wird dies angezeigt.

### Audit / Nachvollziehbarkeit

- Im Monatsbereich gibt es eine **Änderungshistorie** (Audit-Log) zu wichtigen Aktionen.
- Nach **published** sind Änderungen am Dienstplan nur noch als manueller Override erlaubt.

## Export

Im Admin-Bereich kann der Dienstplan exportiert werden:

- **PDF**
- **Excel**

## Hinweise fuer die Nutzung

- Bei Darstellungsproblemen Seite mit `Strg+F5` neu laden.
- Wenn du trotz korrekter Daten nicht einloggen kannst: zuerst **Lokale Daten zuruecksetzen** verwenden.
