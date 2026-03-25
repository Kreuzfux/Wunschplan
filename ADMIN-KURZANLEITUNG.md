# Admin-Kurzanleitung (Pflegedienstleitung)

Diese Kurzinfo fasst die wichtigsten Schritte fuer die monatliche Planung zusammen.

## 1) Login

- App oeffnen: `https://kreuzfux.github.io/Wunschplan/`
- Als Admin anmelden.
- Falls Login haengt: **Lokale Daten zuruecksetzen** klicken und erneut anmelden.

## Rollen (kurz)

- **Admin**: global (Teams/Benutzer/Monate, Generieren, Publizieren, Export).
- **Superuser**: nur eigenes Team (Team-Admin Bereich).

## 2) Monat vorbereiten

1. Admin-Bereich aufrufen (`/#/admin`).
2. Team wählen (Admin: Dropdown; Superuser: fest).
3. **Monat anlegen** klicken.
4. Status auf **open** setzen.

Ergebnis: Mitarbeiter koennen Wunschdienste eintragen.

## 3) Abgabestatus beobachten

- Im Admin-Bereich den Abgabestatus pruefen.
- Optional intern erinnern, wenn Eintraege fehlen.

## 4) Dienstplan generieren

1. Nach Fristende oder vollstaendiger Abgabe auf **Generieren** klicken.
2. Ergebnis pruefen.
3. Bei Bedarf manuell anpassen (Hinweis: nach Publizieren nur noch als manueller Override).

### Limits (max. Schichten pro Monat)

- Pro Mitarbeiter kann ein Limit gepflegt werden.
- Bei offenen Slots zeigt die Generierung eine Warnung an.

## 5) Plan freigeben

- Status auf **published** setzen.

Ergebnis: Mitarbeiter sehen den freigegebenen Dienstplan.

## 6) Export

- Im Admin-Bereich Export ausloesen:
  - PDF
  - Excel
  - Export enthält Team/Monat/Status/Stand (Belegkopf).

## Hauefige Probleme

- **Kein offener Monat sichtbar**: Monat anlegen und auf `open` setzen.
- **Einloggen funktioniert nicht**: Lokale Daten zuruecksetzen, danach neu anmelden.
- **Unerwartetes Verhalten nach Update**: Seite mit `Strg+F5` hart neu laden.
