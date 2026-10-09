# Pi-Startmenü

Startmenü und Standby-Uhr für lokale Browsermodule. Node.js ≥ 22.14.0, keine npm-Abhängigkeiten.

```sh
npm run dev     # http://127.0.0.1:5173, Wetter-Vite intern 5174
npm run build   # baut ../wetterwarte für /wetter/
npm start      # lokale Produktion auf 5173, vorher dev beenden
```

`modules.json` mountet `../wetterwarte/dist` und `../radio`. Im Entwicklungsmodus wird `/wetter/` an den Vite-Server weitergereicht. Die Module liegen neben diesem Repository und werden separat versioniert. Fehlende Module sind als HTTP-Fehler erkennbar; bestehende Module und Startmenü bleiben verfügbar. Die Gesamtanleitung steht im [übergeordneten README](../README.md).

Native Displayvorschau: HTML/SVG wird einmal je Änderung auf die native Pixelgröße gezeichnet, bei 480 × 320 zusätzlich auf RGB565 quantisiert. Die zuvor kalibrierte Browser-Skalierung wird übernommen. Helligkeit und Hardwareleistung werden nicht simuliert. Kiosk: `http://127.0.0.1:5173/?kiosk=1`.

Der Server bindet ausschließlich an Loopback und stellt keine Betriebssystem-Kommandos oder Bluetooth-Administrationsschnittstellen bereit. Radio verwendet die Systemausgabe. Standby ist eine dunkle Ansicht, kein Ausschalten des Computers.

`npm test` benötigt die installierten Wetter-Testabhängigkeiten, Chrome und eine laufende gemeinsame Vorschau. `tests/browser.mjs` kann auch direkt ausgeführt werden.

Die Rastervorschau leitet Maus-/Touchpunkte anhand der tatsächlichen Modulabmessungen weiter. Dadurch werden Safari-Seitenzoom und transformierte eingebettete Ansichten berücksichtigt. Texteingaben in der Rastervorschau erhalten ein direkt bedienbares Eingabefeld über dem Bild. Das letzte vollständige Raster bleibt auch beim Öffnen eines Menüs oder Wechseln der Ansicht sichtbar, bis das neue Bild fertig ist; es gibt keinen Zwischenwechsel zur Browserzeichnung. Während sich Bedienelemente ändern, wartet die Eingabe auf das passende Bild. Ein fehlgeschlagener Bildaufbau entfernt das alte Raster und gibt die aktuelle Browserdarstellung frei.

In der Wetteranwendung: horizontal über dem Inhalt wischen, um die Unterseite zu wechseln, oder über der oberen Menüzeile, um die Hauptansicht zu wechseln. Nach links geht es vorwärts, nach rechts zurück; am ersten/letzten Eintrag bleibt die Ansicht stehen. Ohne Unterseiten wechselt auch die Inhaltsgeste die Hauptansicht. Mit der Maus funktioniert dies durch Ziehen bei gedrückter linker Taste. Zeitregler, Eingabefelder und geöffnete Menüs behalten ihre eigene Bedienung. `tests/preview-navigation.mjs` prüft den Bildwechsel pro Animationsframe sowie Gesten und Zeitregler in allen vier Auflösungen mit Chrome und WebKit, einschließlich Originalgröße und Pixelraster.

`npm run test:safari` verwendet **WebKit im Hintergrund**, ohne ein sichtbares Safari-Fenster. `tests/safari-native.mjs` ist ein zusätzlicher **manueller** Test für das installierte Safari und wird von keiner Standardsuite gestartet. Er benötigt `safaridriver --port 7050` und freigegebene entfernte Automation. Währenddessen nicht in das Automationsfenster klicken: Safari zeigt sonst seinen Eingriffsdialog. Normale App-Nutzung erfolgt in einem separaten Fenster.
