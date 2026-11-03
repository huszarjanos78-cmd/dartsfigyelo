# Dartfigyelő

iPhone-on, Safariban használható, kamerás dartnyíl-érzékelő prototípus.

Élő, frissülő alkalmazás: https://huszarjanos78-cmd.github.io/dartsfigyelo/

## Mit tud most?

- Hátsó kamera indítása és leállítása.
- Automatikus bullfelismerés: piros középpont, zöld bullgyűrű, dupla- és triplagyűrű, valamint szektormintázat együttes ellenőrzése.
- A keret a külső dupla gyűrűt követi, a célkereszt a felismert bullhoz igazodik, nem az ellipszis geometriai közepéhez.
- A bull és a külső dupla gyűrű méretarányának ellenőrzése; a külső szivacs és a piros feliratok önmagukban nem elegendők.
- Bullhoz rögzített perspektivikus mintavétel. Indítás után a felismerő nem írja felül a beállítást.
- Figyelés kézi pontjelölés és százalékos indítási korlát nélkül; újrakeresés a telefon áthelyezésekor.
- Magyar hangos jelzés és nyílszámláló.
- Állítható érzékenység és szüneteltetés a nyilak kiszedéséhez.

0.6 változat: nincs szükség a tábla kézi bejelölésére. A kamera bekapcsolása után
várd meg a bull és a pontozó gyűrűk felismerését. Ellenőrizd a célkeresztet és a
külső dupla gyűrűt követő keretet, majd indítsd a figyelést. A kameraállás százaléka
képi jellemzőkből számított beállítási becslés, nem felismerési pontosság.
Ha a bull vagy a gyűrűk nem láthatók biztosan, a program nem találgat az ellipszis
közepéből. A telefon áthelyezése után a **Tábla újrakeresése** gombbal kezdj újra.
A képfeldolgozás és az OpenCV is a telefon böngészőjében fut.

Ez még képi változásérzékelés, nem tanított nyílfelismerő modell. Hagyományos, húsz szektoros táblához készült. Árnyék, takarás és a telefon mozgása téves jelzést okozhat. Szintetikus képi ellenőrzések és két fényképes böngészőpróba történt; az iPhone-on végzett valós próbákkal még finomítani kell. Pontérték-felismerés és Android-kapcsolat még nincs.

## Folytatás másik számítógépen

Töltsd le a tárolót a **Code → Download ZIP** menüponttal, majd csomagold ki; vagy Git használatával:

```sh
git clone https://github.com/huszarjanos78-cmd/dartsfigyelo.git
cd dartsfigyelo
```

Nyisd meg a kicsomagolt vagy klónozott projektmappát a választott kódszerkesztőben. A Codexben is ezt a mappát válaszd projektként. A forrásfájlok a `dist` mappában találhatók. Node.js 20 vagy újabb és az OpenCV egyszeri előkészítése szükséges:

```sh
node scripts/prepare-opencv.mjs
```

Ez letölti az OpenCV.js 4.13.0 hivatalos, ellenőrzőösszeggel rögzített fájlját a `dist/vendor` mappába. A nagy, generált könyvtár nincs a Gitben; a közzétett alkalmazás tartalmazza. Csomagtelepítés és alkalmazásfordítás nem szükséges.

## Fájlok

- `dist/index.html` – magyar felület.
- `dist/style.css` – megjelenés és mobilos elrendezés.
- `dist/app.js` – kamera, állapotkezelés, változásérzékelés és bemondás.
- `dist/board-vision.mjs` – mintavétel, mozgáskompenzáció és az automatikus felismerő.
- `dist/bull-vision.mjs` – automatikus bull- és gyűrűfelismerés, bullhoz igazított projektív leképezés.
- `dist/calibration.mjs` – a korábbi kézi kalibrálás matematikai segédfüggvényei.
- `scripts/prepare-opencv.mjs` – az OpenCV-függőség ellenőrzött letöltése.
- `tests/vision.test.mjs` – szintetikus képi ellenőrzések.
- `.openai/hosting.json` – az eredeti Sites-projekt közzétételi beállítása.

## Helyi előnézet

### Oldalról elhelyezett kamera

A kamera kb. 1 méterre, kb. 45 fokban oldalról is elhelyezhető. A teljes tábla
férjen a képbe, és a keskenyebb irányban is legyen elég nagy és éles. A távolságot
a program nem méri. A felismert dupla gyűrű és a bull helye határozza meg a vetületet.
A figyelés a rögzített perspektivikus leképezés alapján kör alakú, állandó méretű mintavételi
területen hasonlítja össze a képkockákat, bilineáris interpolációval.
Az apró kameraremegést képkocka-illesztés kompenzálja (a feldolgozott képen legfeljebb 4 pixel eltolásig),
Gaussian-szűréssel és az élek környékén zajtűrő összehasonlítással. A nagyobb, nem illeszthető
elmozdulás továbbra is szünetelteti az észlelést.
A korrekció a tábla síkjára érvényes, a kamera lencsetorzítását nem kalibrálja. A szintetikus tesztek 35–50 fokos nézeteket, valamint 45 fokos,
1 méteres pinhole-vetítést is tartalmaznak. Valós iPhone-os dobáspróba továbbra is kell;
egy kamera képén az egymást takaró nyilak nem mindig különíthetők el.

Ha Python telepítve van, a projekt gyökerében:

```sh
python -m http.server 8080 --directory dist
```

Ezután a számítógépen nyisd meg: http://localhost:8080

Az iPhone kamerájának használatához HTTPS-cím kell. A telefonról megnyitott helyi hálózati HTTP-cím nem elegendő ehhez; a kamerás próbához használd a fent megadott közzétett alkalmazást vagy egy HTTPS-en kiszolgált tesztváltozatot.

## Közzététel és további cél

### GitHub Pages

A tároló **Settings → Pages → Source** beállítása legyen **GitHub Actions**.
A `.github/workflows/pages.yml` folyamat minden `main` ágra feltöltött változásnál
letölti és ellenőrzőösszeggel ellenőrzi az OpenCV-t, lefuttatja a felismerési
teszteket, majd siker esetén közzéteszi a `dist` mappát, az OpenCV-vel együtt.
Kézzel is indítható az **Actions → Deploy Dartfigyelő to GitHub Pages → Run workflow**
lehetőséggel. Az elkészült HTTPS-cím a sikeres futás `deploy` feladatánál és a
Pages beállításainál jelenik meg. Ez a közzététel a korábbi Sites-címet nem frissíti.

Ellenőrzések futtatása:

```sh
node tests/vision.test.mjs
node tests/bull-vision.test.mjs
node tests/controls.test.mjs
node tests/calibration.test.mjs
```

A GitHubra feltöltött módosítások önmagukban nem frissítik a Sites-on futó alkalmazást. A módosításokat külön kell közzétenni a meglévő Sites-projekthez. A hosting-fájlban lévő projektazonosítót őrizd meg az eredeti alkalmazás folytatásakor.

Következő lépés: valódi dobások tesztelése, az érzékelés finomítása, majd pontérték-felismerés és a pontok továbbítása a meglévő Android-programnak.

A kamera képének feldolgozása a böngészőben történik; ez a verzió nem tölti fel a képet szerverre.

A 0.5-ös változat automatikus folyamatát mobilméretű Chromiumban, a felhasználó
által küldött ferde fényképből szimulált kamerával is ellenőriztük (felismerés,
indítás, alaphelyzet és állóképen nulla téves találat). A fénykép nincs a nyilvános
tárolóban. Ez nem helyettesíti a valódi iPhone-kamerával és dobásokkal végzett próbát.

## Nagyítás és nyílkiszedés (0.6)

A kamera fölötti **Nagyítás** csúszka 1–3× digitális nagyítást ad. A kijelző és
a felismerő ugyanazt a képkivágást használja; ismert tábla esetén a nagyítás a
bull köré igazodik. Nagyításváltás után újra kell indítani a figyelést; az addigi
számláló megmarad. A teljes dupla gyűrű maradjon a képen.

Odalépés előtt a **Nyilak kiszedése** gombbal szüneteltesd a figyelést. A rendszer
több képkockán fennmaradó nagy vagy széles, összefüggő képi takarásnál automatikusan
is szünetel, és az üres alaphelyzethez közeledő képet nyílkiszedésként kezeli.
Ez képi változásszűrés, nem tanított emberfelismerés; kis, nyílszerű takarás továbbra
is megtévesztheti, ezért a kézi szünet a biztos módszer. Kiszedés után lépj ki a
képből, majd nyomd meg a **Tábla üres, folytatás** gombot. Új alapképet csak
látható bull és gyűrűk mellett rögzít.
