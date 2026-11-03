# Dartfigyelő

iPhone-on, Safariban használható, kamerás dartnyíl-érzékelő prototípus.

Élő alkalmazás: https://dartfigyelo-iphone-nx20.huszarj1978.chatgpt.site

## Mit tud most?

- Hátsó kamera indítása és leállítása.
- A tábla körvonalának automatikus felismerése a gyűrűk és a húsz váltakozó szektor alapján, ellipszisillesztéssel.
- Élő kameraállás-mutató (0–100%), külön méret-, rálátási szög-, élesség-, megvilágítás- és körvonalértékeléssel.
- Beállítási tanácsok; három egymást követő stabil felismerés után indítható a figyelés, legalább 55%-os értéknél.
- Tartós képi változás észlelése a felismert ellipszisen belül.
- Magyar hangos jelzés és nyílszámláló.
- Állítható érzékenység és szüneteltetés a nyilak kiszedéséhez.

0.2 változat, 2026. november 3. A kameraállás százaléka képi jellemzőkből számított becslés, nem statisztikailag igazolt találatfelismerési pontosság. 75% felett jó, 55–74% között még javítható a beállítás. Kis vagy erősen ferde, illetve kilógó tábla korlátozza az értéket.

Ez még képi változásérzékelés, nem tanított nyílfelismerő modell. Hagyományos, húsz szektoros táblához készült. Árnyék, takarás és a telefon mozgása téves jelzést okozhat. Szintetikus képi ellenőrzések és két fényképes böngészőpróba történt; az iPhone-on végzett valós próbákkal még finomítani kell. Pontérték-felismerés és Android-kapcsolat még nincs.

## Folytatás másik számítógépen

Töltsd le a tárolót a **Code → Download ZIP** menüponttal, majd csomagold ki; vagy Git használatával:

```sh
git clone https://github.com/huszarjanos78-cmd/dartsfigyelo.git
cd dartsfigyelo
```

Nyisd meg a kicsomagolt vagy klónozott projektmappát a választott kódszerkesztőben. A Codexben is ezt a mappát válaszd projektként. A forrásfájlok a `dist` mappában találhatók. Node.js 20 vagy újabb szükséges az OpenCV egyszeri előkészítéséhez:

```sh
node scripts/prepare-opencv.mjs
```

Ez letölti az OpenCV.js 4.13.0 hivatalos, ellenőrzőösszeggel rögzített fájlját a `dist/vendor` mappába. A nagy, generált könyvtár nincs a Gitben; a közzétett alkalmazás tartalmazza. Csomagtelepítés és alkalmazásfordítás nem szükséges.

## Fájlok

- `dist/index.html` – magyar felület.
- `dist/style.css` – megjelenés és mobilos elrendezés.
- `dist/app.js` – kamera, állapotkezelés, változásérzékelés és bemondás.
- `dist/board-vision.mjs` – körvonal, táblamintázat és kameraállás értékelése.
- `scripts/prepare-opencv.mjs` – az OpenCV-függőség ellenőrzött letöltése.
- `tests/vision.test.mjs` – szintetikus képi ellenőrzések.
- `.openai/hosting.json` – az eredeti Sites-projekt közzétételi beállítása.

## Helyi előnézet

Ha Python telepítve van, a projekt gyökerében:

```sh
python -m http.server 8080 --directory dist
```

Ezután a számítógépen nyisd meg: http://localhost:8080

Az iPhone kamerájának használatához HTTPS-cím kell. A telefonról megnyitott helyi hálózati HTTP-cím nem elegendő ehhez; a kamerás próbához használd a fent megadott közzétett alkalmazást vagy egy HTTPS-en kiszolgált tesztváltozatot.

## Közzététel és további cél

Ellenőrzések futtatása:

```sh
node tests/vision.test.mjs
```

A GitHubra feltöltött módosítások önmagukban nem frissítik a Sites-on futó alkalmazást. A módosításokat külön kell közzétenni a meglévő Sites-projekthez. A hosting-fájlban lévő projektazonosítót őrizd meg az eredeti alkalmazás folytatásakor.

Következő lépés: valódi dobások tesztelése, az érzékelés finomítása, majd pontérték-felismerés és a pontok továbbítása a meglévő Android-programnak.

A kamera képének feldolgozása a böngészőben történik; ez a verzió nem tölti fel a képet szerverre.
