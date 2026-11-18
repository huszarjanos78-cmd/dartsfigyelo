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

Ez még képi változásérzékelés, nem tanított nyílfelismerő modell. Hagyományos, húsz szektoros táblához készült. Árnyék, takarás és a telefon mozgása téves jelzést okozhat. Szintetikus képi ellenőrzések és két fényképes böngészőpróba történt; az iPhone-on végzett valós próbákkal még finomítani kell. A pontérték kísérleti, javítható becslés; Android-kapcsolat még nincs.

## Folytatás másik számítógépen

Töltsd le a tárolót a **Code → Download ZIP** menüponttal, majd csomagold ki; vagy Git használatával:

```sh
git clone https://github.com/huszarjanos78-cmd/dartsfigyelo.git
cd dartsfigyelo
```

Nyisd meg a kicsomagolt vagy klónozott projektmappát a választott kódszerkesztőben. A Codexben is ezt a mappát válaszd projektként. A forrásfájlok a `dist` mappában találhatók. Node.js 22 vagy újabb, valamint az OpenCV egyszeri előkészítése szükséges:

```sh
npm ci --ignore-scripts
node scripts/prepare-opencv.mjs
```

Ez letölti az OpenCV.js 4.13.0 hivatalos, ellenőrzőösszeggel rögzített fájlját a `dist/vendor` mappába. A nagy, generált könyvtár nincs a Gitben; a közzétett alkalmazás tartalmazza. A böngészőtesztek függőségeit az npm-zárfájl rögzíti. Alkalmazásfordítás nem szükséges.

## Fájlok

- `dist/index.html` – magyar felület.
- `dist/style.css` – megjelenés és mobilos elrendezés.
- `dist/app.js` – kamera, állapotkezelés, változásérzékelés és bemondás.
- `dist/board-vision.mjs` – mintavétel, mozgáskompenzáció és az automatikus felismerő.
- `dist/bull-vision.mjs` – automatikus bull- és gyűrűfelismerés, bullhoz igazított projektív leképezés.
- `dist/calibration.mjs` – a korábbi kézi kalibrálás matematikai segédfüggvényei.
- `dist/scoring.mjs` – javítható pontbecslés, a közép fölötti 20-assal és a szabványos szektorsorrenddel.
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
teszteket és a számozás nélküli táblán végzett pontozási böngészőpróbát, majd siker esetén közzéteszi a `dist` mappát az OpenCV-vel együtt.
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

A következő dobásoknál a változó képrész legbelső pontjából kísérleti pontbecslés készül. Minden dobás mellett választható a helyes S/D/T mező, bull vagy mellé. Az összeg azonnal frissül, az ismeretleneket külön jelzi. Új körnél a pontlista törlődik. A 0.11.2 változattól a 20-as iránya a közép fölött van, nem igényel kézi megjelölést vagy számfelismerést.

A szár vagy toll helye nem azonos a becsapódással; a pontérték mindig ellenőrzendő, valós kamerás pontossága még nincs igazolva.


## Pontozás a közép fölötti 20-assal (0.11.2)

A 20-as mezőt a bull közvetlenül fölötti irányában feltételezi a program. A tábla legyen álló helyzetben, és a kameraképen is a közép fölött legyen a 20-as. A többi mező az óramutató járásával megegyezően a szabványos sorrendet követi:

20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5.

A bull és a gyűrűk felismerése után, a **Figyelés indítása** gombbal rögzített tábla azonnal megkapja ezt a pontozási irányt. A 20-as jelölés a kameraképen mutatja a feltételezett irányt. A korábbi számleolvasó, nyelvi modell, háttérfolyamat és az újraolvasási gomb kikerült. Az olvashatatlan vagy hiányzó számfelirat nem akadályozza a pontbecslést.

A felismert ellipszis tengelyei elfordulhatnak a képen; ezért a képernyőn felfelé mutató irányt a program visszavetíti a tábla síkjába. A perspektívakorrekció megmarad. Zoomváltás vagy tábla-újrakeresés után az új rögzítés ugyanígy újraszámítja a pontozási irányt. Automatikus új körnél az irány megmarad, a pontlista törlődik.

Ez a megoldás nem ismeri fel az elforgatott táblát vagy az oldalra döntött kamerát: a 20-asnak a kameraképen a közép fölött kell lennie. A nyíl képi helyéből számított pont továbbra is kísérleti, kézzel javítható becslés. A szár és toll eltérhet a tényleges becsapódási ponttól.

A böngészőteszt számozás nélküli szintetikus táblán ellenőrzi a tábla rögzítését, a 60 pontos tripla 20 becslést, a kézi javítást és az automatikus új kört. Nincs OCR-könyvtár-, modell- vagy worker-kérés. Valós iPhone-os dobáspróba továbbra is szükséges.
