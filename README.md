# Dartfigyelő

iPhone-on, Safariban használható, kamerás dartnyíl-érzékelő prototípus.

Élő alkalmazás: https://dartfigyelo-iphone-nx20.huszarj1978.chatgpt.site

## Mit tud most?

- Hátsó kamera indítása és leállítása.
- A tábla kijelölése két érintéssel.
- Tartós képi változás észlelése a kijelölt területen.
- Magyar hangos jelzés és nyílszámláló.
- Állítható érzékenység és szüneteltetés a nyilak kiszedéséhez.

Ez még képi változásérzékelés, nem tanított nyílfelismerő modell. Árnyék, takarás és a telefon mozgása téves jelzést okozhat. A valódi dobásokkal és iPhone-nal végzett tesztelés még hátravan. Pontérték-felismerés és Android-kapcsolat még nincs.

## Folytatás másik számítógépen

Töltsd le a tárolót a **Code → Download ZIP** menüponttal, majd csomagold ki; vagy Git használatával:

```sh
git clone https://github.com/huszarjanos78-cmd/dartsfigyelo.git
cd dartsfigyelo
```

Nyisd meg a kicsomagolt vagy klónozott projektmappát a választott kódszerkesztőben. A Codexben is ezt a mappát válaszd projektként. A forrásfájlok a `dist` mappában találhatók; nincs szükség csomagtelepítésre vagy fordításra.

## Fájlok

- `dist/index.html` – magyar felület.
- `dist/style.css` – megjelenés és mobilos elrendezés.
- `dist/app.js` – kamera, területkijelölés, változásérzékelés és bemondás.
- `.openai/hosting.json` – az eredeti Sites-projekt közzétételi beállítása.

## Helyi előnézet

Ha Python telepítve van, a projekt gyökerében:

```sh
python -m http.server 8080 --directory dist
```

Ezután a számítógépen nyisd meg: http://localhost:8080

Az iPhone kamerájának használatához HTTPS-cím kell. A telefonról megnyitott helyi hálózati HTTP-cím nem elegendő ehhez; a kamerás próbához használd a fent megadott közzétett alkalmazást vagy egy HTTPS-en kiszolgált tesztváltozatot.

## Közzététel és további cél

A GitHubra feltöltött módosítások önmagukban nem frissítik a Sites-on futó alkalmazást. A módosításokat külön kell közzétenni a meglévő Sites-projekthez. A hosting-fájlban lévő projektazonosítót őrizd meg az eredeti alkalmazás folytatásakor.

Következő lépés: valódi dobások tesztelése, az érzékelés finomítása, majd pontérték-felismerés és a pontok továbbítása a meglévő Android-programnak.

A kamera képének feldolgozása a böngészőben történik; ez a verzió nem tölti fel a képet szerverre.
