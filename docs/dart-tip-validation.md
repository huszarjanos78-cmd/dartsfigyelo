# Nyílhegy-felismerés: ellenőrzés és korlátok

A 0.12.0 kísérleti modellbeépítés, nem igazoltan megbízható automata pontozó.
A hibás tippelés helyett ismeretlen értéket hagyhat. A modell nem lát át a tollon,
és három egyező téves jelölés továbbra is okozhat hibás pontot.

## Más rendszerek módszerei

- [DeepDarts](https://arxiv.org/abs/2105.09880): tanított hegy- és kalibrációs
  kulcspontok, perspektivikus transzformáció, szabványos gyűrűk és szektorok.
- [Dart Sense](https://github.com/bnww/dart-sense): YOLOv8 és időbeli megerősítés.
- [Autodarts](https://autodarts.io/): több kamera segíti a hegy pozíciójának
  meghatározását és a takarások kezelését. Egyetlen telefon nem ad több nézőpontot.

A beépítés átveszi a tanított hegy + geometria + időbeli ellenőrzés elvét,
a meglévő bull/gyűrű-kalibrációval és számleolvasással. A képkülönbség csak
keresési terület, soha nem a pontozási koordináta. Az üres táblán jelölt helyek
kiszűrése csökkenti az állandó feliratokból eredő téves hegyeket. Nyolc
sikertelen próbánál leáll a sor automatikus ellenőrzése; kézzel javítható/újrapróbálható.
A túl közeli (0,025 táblasugáron belüli) találatok megkülönböztetése korlátozott.

## Tíz forrásfotó: a modell hibái is megmaradnak

Forrás: bnww/dart-sense `small_sample`, commit
`6cbcb9192c30157415a8ef8658ece17cda044a85`. PyTorch CPU, dd6, 800-as bemenet,
0,5 bizalmi küszöb, IoU 0,5. Hibák: minden címkézett hegy legközelebbi
predikciójának távolsága eredeti pixelben; 999 = nincs predikció.
Ez nem egy-egy megfeleltetéses pontosságmérés, a hamis pozitívak külön a
predikciószámban és a [nyers eredményben](source-photo-probe.json) láthatók.

| Fotó | Címkézett hegy | Modelljelölés | Legközelebbi eltérések (px) |
|---|---:|---:|---|
| 0018_151123_2498.png | 0 | 0 | — |
| 0018_151123_2519.png | 3 | 0 | 999.0, 999.0, 999.0 |
| 1054_171023_48.png | 3 | 6 | 112.29, 23.37, 20.86 |
| 1054_171023_53.png | 2 | 3 | 2.6, 20.48 |
| 1813_171023_1320.png | 2 | 2 | 8.22, 29.61 |
| 1813_171023_1322.png | 1 | 0 | 999.0 |
| d1_02_04_2020 IMG_1093.JPG | 3 | 2 | 2.65, 546.67, 0.32 |
| d1_02_04_2020 IMG_1099.JPG | 3 | 3 | 0.65, 2.26, 1.08 |
| d2_02_03_2021 DSC_0544.JPG | 3 | 3 | 0.56, 0.64, 0.23 |
| d2_02_03_2021 DSC_0557.JPG | 3 | 3 | 1.15, 0.08, 0.14 |

A négy DeepDarts fotó a böngészős regressziós készletben is szerepel:
három fotón mindhárom jelölés 5 pixelen belül, az IMG_1093 fotón egy nyíl
kimarad. A teszt ezt a hiányt is számon tartja. A forrásadatbázis a modell
betanításának forrása is lehetett, ezért ezekből általános pontosság nem becsülhető.
A böngészős ONNX/WASM futás a tesztgépen kb. 0,67–0,85 s/kép volt, a modell
első betöltésén felül. Ez nem iPhone-sebességmérés. Fotólicencek és SHA256:
[fixtures/sources.json](../tests/fixtures/dart-tips/sources.json).

## Független környezet: húsz oldalnézeti fotó

[geforcefan/dartscribe](https://huggingface.co/datasets/geforcefan/dartscribe),
CC BY-SA 4.0, Ercan Akyürek; verzió
`5d34cb7ee64501d13192faa24b49db791c3f5ac5`.
A rendezett sessionlistából minden hatodik session első dobáscsoportja,
0. kamera, üres + 1/2/3 nyíl: öt csoport, húsz fotó. A külső dupla gyűrű
címkéiből vett befoglaló téglalap körül 18% ráhagyás, 800-as modellbemenet,
0,3-as küszöb, IoU 0,5. Ez feltáró vizsgálat, nem a végső böngészős kapuzás
pontosságmérése; az alkalmazás szigorúbb, 0,5-ös küszöböt használ.

Több üres képen is megjelent téves hegyjelölés, és takart nyilak kimaradtak.
A homográfiával szembenézetbe alakítás sem oldotta meg megbízhatóan a problémát.
[Nyers jelölések és forrásképutak](independent-photo-probe.json).
A dobásonkénti referenciák többnyire `source: detected`, néhány `corrected`:
ezek nem tekinthetők független, kézzel ellenőrzött ground truth-nak.
Ezért ebből sem állítunk pontossági százalékot vagy javulási arányt.

## Mit ellenőriznek az automatizált tesztek?

- RGB/255 NCHW előfeldolgozás, letterbox és visszavetítés nagy kameraképre,
  osztálysorrend és NMS; rossz modellalak elutasítása.
- Három egyező hegy szükséges; mozgó/többértelmű/dupla jelölések,
  hiányzó hegy, kézi javítás, régi táblaeredmény védelme.
- Üresképi téves jelölések kiszűrése; mozgás közbeni eredmény eldobása;
  modellhiba esetén számlálás és kézi pont megtartása, újrapróbálás.
- Valódi modul-worker, helyi WASM és a rögzített ONNX-modell négy fotón;
  nincs külső képküldés. Szintetikus vonalból nem állítunk automatikus T20-at.
- A meglévő számlálás, kiszedés utáni automatikus folytatás, OCR,
  tartalékirány, kézi javítás és mobilos elrendezés regressziói.

Következő szükséges ellenőrzés: a felhasználó saját iPhone-jával, üres tábláról
induló teljes dobásmenetek; külön a számláló és az automatikusan pontozott
nyilak arányának, valamint a téves pontoknak a feljegyzése. Ettől a kiadástól
sem indokolt hibamentes felismerést ígérni.
