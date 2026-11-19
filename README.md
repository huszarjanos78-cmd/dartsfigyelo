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

0.9.1 változat: nincs szükség a tábla kézi bejelölésére. A kamera bekapcsolása után
várd meg a bull és a pontozó gyűrűk felismerését. Ellenőrizd a célkeresztet és a
külső dupla gyűrűt követő keretet, majd indítsd a figyelést. A kameraállás százaléka
képi jellemzőkből számított beállítási becslés, nem felismerési pontosság.
Ha a bull vagy a gyűrűk nem láthatók biztosan, a program nem találgat az ellipszis
közepéből. A telefon áthelyezése után a **Tábla újrakeresése** gombbal kezdj újra.
A képfeldolgozás és az OpenCV is a telefon böngészőjében fut.

A 0.12.0 a nyilakat továbbra is képi változásból számlálja, a pontot viszont már helyben futó, tanított nyílhegy-modellből becsüli. Három nyugodt képen egyező hegyjelölés kell; hiányzó, takart vagy többértelmű hegy esetén a pont ismeretlen marad. Hagyományos, húsz szektoros táblához készült. Árnyék, takarás és a telefon mozgása téves jelzést okozhat. Szintetikus képi ellenőrzések és két fényképes böngészőpróba történt; az iPhone-on végzett valós próbákkal még finomítani kell. A pontérték kísérleti, javítható becslés; Android-kapcsolat még nincs.

## Folytatás másik számítógépen

Töltsd le a tárolót a **Code → Download ZIP** menüponttal, majd csomagold ki; vagy Git használatával:

```sh
git clone https://github.com/huszarjanos78-cmd/dartsfigyelo.git
cd dartsfigyelo
```

Nyisd meg a kicsomagolt vagy klónozott projektmappát a választott kódszerkesztőben. A Codexben is ezt a mappát válaszd projektként. A forrásfájlok a `dist` mappában találhatók. Node.js 22 vagy újabb, valamint az OpenCV és a helyi számfelismerő egyszeri előkészítése szükséges:

```sh
npm ci --ignore-scripts
node scripts/prepare-opencv.mjs
npm run prepare:ocr
npm run prepare:tips
```

Ez letölti az OpenCV.js 4.13.0 hivatalos, ellenőrzőösszeggel rögzített fájlját a `dist/vendor` mappába. A nagy, generált könyvtár nincs a Gitben; a közzétett alkalmazás tartalmazza. A számleolvasó eszközei és modellje az npm-zárfájlban rögzített csomagokból kerülnek a `dist/vendor/ocr` mappába. Minden felismerés a böngészőben történik, a kamerakép nem kerül szerverre. Alkalmazásfordítás nem szükséges.

## Fájlok

- `dist/index.html` – magyar felület.
- `dist/style.css` – megjelenés és mobilos elrendezés.
- `dist/app.js` – kamera, állapotkezelés, változásérzékelés és bemondás.
- `dist/board-vision.mjs` – mintavétel, mozgáskompenzáció és az automatikus felismerő.
- `dist/bull-vision.mjs` – automatikus bull- és gyűrűfelismerés, bullhoz igazított projektív leképezés.
- `dist/calibration.mjs` – a korábbi kézi kalibrálás matematikai segédfüggvényei.
- `dist/scoring.mjs` – javítható pontbecslés és a közép fölötti 20-ashoz tartozó tartalékirány.
- `dist/score-orientation.mjs` – a tábla irányának meghatározása a leolvasott számokból.
- `scripts/prepare-ocr.mjs` – helyi számleolvasó és nyelvi modell előkészítése.
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
teszteket, a számleolvasási és a tartalék pontozási böngészőpróbát, majd siker esetén közzéteszi a `dist` mappát az OpenCV-vel és a helyi számleolvasóval együtt.
Kézzel is indítható az **Actions → Deploy Dartfigyelő to GitHub Pages → Run workflow**
lehetőséggel. Az elkészült HTTPS-cím a sikeres futás `deploy` feladatánál és a
Pages beállításainál jelenik meg. Ez a közzététel a korábbi Sites-címet nem frissíti.

Ellenőrzések futtatása:

```sh
npm test
npx playwright install chromium
npm run test:browser
```

A GitHubra feltöltött módosítások önmagukban nem frissítik a Sites-on futó alkalmazást. A módosításokat külön kell közzétenni a meglévő Sites-projekthez. A hosting-fájlban lévő projektazonosítót őrizd meg az eredeti alkalmazás folytatásakor.

Következő lépés: valódi dobások és a pontbecslés tesztelése, az érzékelés finomítása, majd a pontok továbbítása a meglévő Android-programnak.

A kamera képének feldolgozása a böngészőben történik; ez a verzió nem tölti fel a képet szerverre.

A 0.5-ös változat automatikus folyamatát mobilméretű Chromiumban, a felhasználó
által küldött ferde fényképből szimulált kamerával is ellenőriztük (felismerés,
indítás, alaphelyzet és állóképen nulla téves találat). A fénykép nincs a nyilvános
tárolóban. Ez nem helyettesíti a valódi iPhone-kamerával és dobásokkal végzett próbát.

## Nagyítás és automatikus új kör (0.7)

A kamera fölötti **Nagyítás** csúszka 1–3× digitális nagyítást ad. A kijelző és
a felismerő ugyanazt a képkivágást használja; ismert tábla esetén a nagyítás a
bull köré igazodik. Nagyításváltás után újra kell indítani a figyelést; az addigi
számláló megmarad. A teljes dupla gyűrű maradjon a képen.

Nyílkiszedéskor a nagyobb takarás vagy a nyilak eltávolítása automatikus
számolási szünetet indít. Az induláskor rögzített üres táblaképet megőrzi.
Amikor minden nyíl kint van, a takarás megszűnt, és az üres tábla kb. 1,4 másodpercig
stabilan visszatért, ellenőrzi a bullt és a pontozó gyűrűt, nullázza a számlálót,
és gombnyomás nélkül folytatja a következő kört. Részleges kiszedés vagy takarás
nem elegendő a nullázáshoz. Az első alapképet üres táblával kell felvenni.

A **Nyilak kiszedése** gomb tartalék kézi szünetként megmarad. A szünetben
megnyomva kézi folytatást ad, ha az automatikus visszaállás nem sikerül. A kép
összehasonlítása nem tanított ember- vagy nyílfelismerés: kis nyílszerű takarás,
árnyék, kameramozgás és egymást fedő nyilak továbbra is okozhatnak hibát.

## Kis nyílváltozások érzékelése (0.8)

A simított szürkeárnyalatos mozgásellenőrzés mellett külön, elmosatlan RGB-színjel
is megmarad a kalibrált pontozóterületen. Kis, helyhez kötött változást csak három
egymást követő stabil képen fogad el; a már meglévő táblaszélek körül zajtűrést
alkalmaz. Így a globális érzékenység csökkentése nélkül is felismerhet olyan kis
tollat, amelynek szürkeárnyalatos területváltozása a korábbi küszöb alatt maradt.
A takarásvizsgálat és az automatikus új kör megmarad; az új színjel a kiszedés
és az üres tábla ellenőrzésében is részt vesz.

A tesztek vékony nyílszárat, kis színes tollat, szürkeárnyalatban azonos fényességű
színváltozást, egyszeri zajt, expozícióváltást és kompenzált remegést tartalmaznak.
Ezek nem adnak százalékos pontossági becslést a valódi dobásokra; azt új
iPhone-os tesztsorozattal kell ellenőrizni.

## Ferde középső és peremközeli nyilak (0.9)

A változó folt vastagságát a saját főtengelyei mentén vizsgálja, ezért egy ferdén
látszó keskeny nyíl nem lesz pusztán a képernyőn elfoglalt szélessége miatt
kéznek/takarásnak minősítve. A nagy vagy széles takarás továbbra is szüneteltet.

A felismerési keret továbbra is a külső dupla gyűrűn marad, de a megfigyelt
kör sugara annak 118%-áig ér: ez a dupla melletti keskeny táblaperemet is tartalmazza,
hogy a kifelé vetülő szár/toll ne maradjon ki. A vetített, képen kívüli mintákat
kihagyja. A normalizált rács 224×224, a feldolgozott kép hosszabb oldala legfeljebb
720 pixel, a forrás képkivágásának felbontásánál nem nagyobb.

Tizenöt célzott teszt tartalmaz ferde középső foltot, széles kéztakarást, a dupla
belső/külső szélét és a szomszédos peremet, mindkét oldali perspektívával. A régi
0.8.1 kódon ezek a regressziós esetek hibáztak. Ez nem pontszámfelismerés, és nem
igazolt százalékos pontossági adat; a valódi nyilakkal végzett próbát továbbra is
folytatni kell. A tábla által takart vagy a kameraképből kilógó nyílrészlet nem
állítható vissza pusztán a nagyítással.

## Teljes táblaperem figyelése (0.9.1)

A fő jelölőkeret a szabványos, kb. 450 mm átmérőjű dartstábla külső körvonalát
követi, a számozott fekete peremmel együtt. A belső kalibrálás továbbra is a bull
és a 340 mm-es dupla gyűrű alapján történik. A megfigyelt sugár a dupla gyűrű
sugarának 1,34-szerese, 256×256 mintavételi rácson, így a korábbi mintasűrűség
megmarad. A dupla melletti, külső táblaperembe érkező nyilak is megfigyelhetők.
A teljes külső perem férjen a kameraképbe; kilógáskor a felület kisebb zoomot kér,
de nem tiltja le az indítást. A keret mérete szabványos táblaméretből számított
becslés; egy kameraképből a takart vagy képen kívüli nyílrészletek nem állíthatók vissza.

## Automatikus folytatás és javítható pontbecslés (0.10.0)

A rögzített táblát az időszakos újrakeresés már nem oldja fel. A kameraelmozdulást továbbra is a mozgásellenőrzés kezeli. Automatikus új körnél a korábbi táblavesztési állapot is törlődik.

A következő dobásoknál a változó képrész legbelső pontjából kísérleti pontbecslés készül. Minden dobás mellett választható a helyes S/D/T mező, bull vagy mellé. Az összeg azonnal frissül, az ismeretleneket külön jelzi. Új körnél a pontlista törlődik. A 0.11.2 változattól a számleolvasás az elsődleges; bizonytalan eredménynél a közép fölötti 20-as tartalékirányt használja, kézi megjelölés nélkül.

A szár vagy toll helye nem azonos a becsapódással; a pontérték mindig ellenőrzendő, valós kamerás pontossága még nincs igazolva.


## Számleolvasás és „20 felül” tartalék pontozás (0.11.2)

A program először a tábla számaiból próbálja meghatározni a 20-as irányát. Ehhez legalább három különböző számnak kell azonos irányt alátámasztania. Az ismételten leolvasott azonos szám nem számít új bizonyítéknak. A jobb felbontású kamerakivágás és a halvány számok kontrasztjavítása megmarad. A számleolvasás helyben, a telefon böngészőjében fut.

A tábla rögzítésekor ideiglenesen a közép fölötti mezőt veszi 20-asnak, amíg a számleolvasás befejeződik. Így a pontbecslés nem vár a leolvasásra. Ha a leolvasás nem sikerül, ez a tartalékirány marad aktív. A tartalék működéshez a 20-as a kameraképen is a bull közvetlenül fölött legyen. A többi mező a szabványos sorrendet követi:

20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5.

A **Pontbecslés** alatti állapot mindig jelzi, hogy még folyamatban van a leolvasás, a leolvasott számok alapján pontoz, vagy a „20 felül” tartalékirányt használja. A kameraképen a 20-as jelölés az aktuálisan használt irányt mutatja.

Sikeres számleolvasáskor az elsődleges irány veszi át a pontozást. Az ugyanabban a kamerabeállításban rögzített korábbi, nem javított dobások becslését is ehhez igazítja. A kézzel javított és a kézzel ismeretlenre állított találatokat nem írja felül. Sikertelen leolvasáskor a meglévő tartalék pontok nem tűnnek el.

Legfeljebb három automatikus próbálkozás történik a nyugodt képen, akár nyilakkal a táblában is. A **Számok újraolvasása** gomb a számláló törlése nélkül indít új próbát. Sikeres leolvasás után az irány rögzített marad. Zoomváltás vagy tábla-újrakeresés érvényteleníti a korábbi leolvasási feladatot; új rögzítésnél ismét a leolvasás az elsődleges, a felső 20-as pedig az ideiglenes tartalék.

A böngészőpróbák valódi helyi számleolvasást és számozás nélküli képen a tartalék pontozást is ellenőrzik: tábla-rögzítés, tripla 20 (60 pont), kézi javítás és automatikus új kör. Valós iPhone-os próba továbbra is szükséges. A nyíl helyéből becsült pont kísérleti, kézzel javítható érték; a szár és toll eltérhet a tényleges becsapódási ponttól.

## 0.12.0 – tanított nyílhegy-felismerés (kísérleti)

A képkülönbség csak keresési területet ad; a szár legbelső képpontja többé nem
határozza meg a pontot. Az üres táblán felismert állandó téves jelöléseket kiszűrjük,
a modell három egymást követő megfigyelésének egyeznie kell. Nyolc sikertelen
megfigyelés után kézi javítás vagy a **Nyílhegyek újraellenőrzése** használható.
Induláskor üres tábla szükséges. A hegyfelismerés nem javítja meg a hibás
bull/gyűrű-beállítást vagy a téves számleolvasást. Az oldalról takart és egymáshoz
közeli nyilak továbbra is nehéz esetek.

A ScoreLens dd6 modell **CC BY-NC 4.0**, vagyis nem kereskedelmi használatra való;
[forrás, licencek és változtatások](dist/models/README.md).
A modell kb. 12 MB, a helyi WASM futtatókörnyezet további letöltést igényel.
[Valós képes ellenőrzés és ismert hibák](docs/dart-tip-validation.md).
Nincs igazolt iPhone-os pontossági eredmény.

Ellenőrzés: `npm test`, majd `npx playwright install chromium` és
`npm run test:browser`. A böngészős teszt valódi ONNX-modellt és címkézett
fényképeket használ, de ezek részben a tanítás forrásadatbázisából származnak,
ezért nem független pontosságmérés. A közzétételt továbbra is GitHub Actions végzi.
