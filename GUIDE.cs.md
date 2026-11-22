# Rusalka – návod a architektura

English: [GUIDE.md](GUIDE.md)

## Použití
Menu vpravo nahoře (Kdo jde hrát, Domů, Nový hráč): **Moje písničky** (přidat písničku, vložit noty z AI chatu,
kde vzít noty, vymyslet písničku a seznam vašich vlastních písniček: upravit noty, lehčí verze, smazat), **Hráči**
(týden, úprava, smazání, přidání), **AI** (AI nástroje), **Nastavení** (jazyk, názvy tónů, klavír, data a zálohy)
a **O Rusalce**. Kde se odkazy nevejdou, ukáže lišta jen **AI** a **Menu**.

1. **Hráč:** na úvodní obrazovce vyber nebo přidej hráče (zvířátko, dítě/dospělý).
2. **Písnička:** klepni na písničku. Novou přidáš tlačítkem **Přidat písničku**:
   - MusicXML (`.musicxml`, `.xml`, `.mxl`) se načte přímo,
   - MIDI (`.mid`, `.midi`, `.kar`) převede aplikace sama: vybereš stopu s melodií (a případně levou ruku),
     noty se zarovnají na mřížku, rozdělí do taktů, odhadne se předznamenání a předtaktí, slabiky z karaoke souborů
     se přiřadí k notám. Výsledek se otevře v editoru,
   - PDF a fotky not aplikace nepřevádí – viz **Noty z papíru** níže.

   **Kde vzít noty** ukáže odkazy na volné zdroje (Mutopia, OpenScore, MuseScore.com, IMSLP) a bezplatné programy
   (MuseScore Studio, Audiveris na převod PDF). Aplikace otevírá jen odkazy z pevného seznamu.

   **Knihovna písniček** (jen na webu) je přímo na Domově: záložky Dětské, Lidové ze světa, Vánoční a Klasika ukazují
   písničky z knihovny (jsou mezi nimi i ukázkové), nejdřív ty do úrovně hráče, za nimi těžší, ztlumené. **Pro mě** k rozehraným písničkám přidá pár dalších z knihovny přiměřených úrovni
   hráče, **Moje** ukáže písničky, které jste přidali sami, a hledání prohledá všechno. Každá dlaždice ukazuje
   obtížnost (1–3 klávesy). Moje písničky ukazují jen písničky, které jste přidali.
3. **Tři kroky učení** (a poslech zvlášť):
   1. *Najdi noty*: bez tempa, čeká na správnou klávesu.
   2. *S doprovodem*: doprovod hraje v tempu, ale u každé noty počká, dokud nezazní.
   3. *V rytmu*: odpočet podle taktu, doprovod a hodnocení načasování.

   *Poslechnout* (tlačítko vedle kroků): aplikace zahraje a ukáže klávesy.

   Každý krok má na kartě písničky vlastní hvězdy.

   **Zvuk z klavíru** (Nastavení → Hraní, v Chromu a Edge s klavírem přes MIDI): doprovod, poslech a klávesy na obrazovce
   hraje připojený klavír přes MIDI, ne počítač. Noty jdou na kanál 2, aby nerušily hráče; hlasitost se řídí
   knoflíkem na klavíru. Metronom klepe dál v počítači. Bez připojeného klavíru hraje počítač jako dřív.

   **Ve dvou** (tlačítko ve druhé liště): dvě děti u jednoho klavíru, obě pravou rukou. Jedno hraje melodii
   (vpravo, horní osnova), druhé basovou linku z akordů (vlevo, dolní osnova: základní tón akordu na celý takt).
   Každému svítí jeho klávesy v barvě jeho zvířátka, chybný stisk se přičte tomu, do jehož části klaviatury padl.
   Výsledky má každé dítě zvlášť a ukládají se mimo sólové hvězdy (na kartě písničky „Ve dvou“). **Vyměnit role**
   prohodí melodii a bas, **Hrát sám** se vrátí ke hraní o samotě. Ve dvou není Naučit se, smyčka ani mikrofon
   a písnička bez akordových značek bas nemá. Doprovod hraje jen akordy bez basu.

   **Rusalka hraje s tebou** (před hraním: Hraješ … · změnit; platí pro všechny písničky): když Rusalka nehraje zapsanou levou ruku, doprovod se hraje z akordových
   značek podle taktu a tempa – valčík ve 3/4 a 6/8, um-pa ve 2/4, balada nebo polka ve 4/4, u pomalých písniček
   rozložený akord, na konci držený akord. Jde zvolit i konkrétní styl nebo „Jen akordy“ (akord na těžké doby).
   Písničky se zapsanou levou rukou hrají v doprovodu tu.

   **Metronom** klepe během hry. **Naučit se** je průvodce, který písničku projde fráze po frázi:
   1. poslech,
   2. najdi noty,
   3. s doprovodem na 70 %.

   Po dvou frázích je spojí a nakonec přijde celá písnička. Dál se jde po čistém průchodu nebo po třech pokusech
   s přesností aspoň 85 %.
4. **Co budeš hrát?** (před hraním řádek „Hraješ: … · změnit“; „písnička roste s tebou“):
   1. Melodie, snadný rytmus,
   2. Celá melodie,
   3. Melodie a basy (levá ruka drží jeden tón),
   4. Melodie a akordy (levá ruka hraje akordy; styl levé ruky jde zvolit jen tady),
   5. Všechny noty: noty přesně podle souboru. Kreslí se a hrají z původního MusicXML, takže zůstanou všechny hlasy
      v obou rukou, dynamika, obloučky, pedál, příraznice a změny tóniny, taktu i klíče. Z vícepartových souborů
      (zpěv s klavírem apod.) se bere první part. V jiné tónině, s vlastním prstokladem nebo stylem doprovodu se
      hraje zjednodušená verze (jeden hlas v ruce); karta to řekne.

   Pod kartami je **Kterou rukou hraješ** (Pravou · Levou · Oběma; druhou ruku zahraje Rusalka). Karta s levou
   rukou (3–5) přepne na Oběma, karta 1–2 na Pravou. Při otevření písničky platí uložená úroveň a ruka podle věku
   (děti pravou, dospělí obě). Celá partitura je tedy klepnutí na „Všechny noty“.

   Úrovně 3–4 se vytvoří z akordových značek; když noty akordy nemají, aplikace je odvodí.
   **Tónina:** původní / snadná (C, G, F, D dur; a, e, d moll) / do C dur. **Prstoklad:** čísla prstů nad notami.
5. **Úsek a smyčka:**
   - Cvičit lze celou písničku, jednotlivé fráze (2–4 takty) nebo „těžká místa“ podle statistiky chyb hráče.
     Úseky mají vlastní hvězdičky.
   - **Smyčka** úsek opakuje. V rytmu po 3 čistých průchodech zrychlí o 5 %, při přesnosti pod 70 % zpomalí.
     Najdi noty končí po 3 čistých průchodech.
   - **Doprovod** levé ruky jde zvolit i jako styl: dlouhé basy, akordy, valčík, polka, pochod, ukolébavka, tango
     nebo pop balada.
6. **Trenér po dohrání:** jedna konkrétní rada a úkol („Procvičit takty 5–8 na 60 %“), složené z čísel o chybách
   (které takty, jaký druh chyby, rychlost, zlepšení proti minule).
   **Celá stránka not** (Nastavení → Noty): řádky not pod sebou místo jednoho dlouhého řádku. Stránka se při hře
   posouvá na aktuální řádek, ve V rytmu jede po řádku ukazatel.
   **Klaviatura na obrazovce** jde s připojeným klavírem vypnout, noty pak mají celou výšku (nejvíc místa dává
   spolu s celou stránkou). Dospělý hráč má u dvouručních skladeb rovnou zvolené obě ruce.
7. **Upravit noty:** editor kterékoli písničky (klepni na notu; šipky výška, ←→ další nota, 1–6 délka, `.` tečka,
   `R` pomlka, `T` ligatura, Cmd+Z zpět). Tón zahraný na klavíru se zapíše do vybrané noty.
8. **Kalibrace** (v režimu V rytmu): změří zpoždění klavíru/zvuku (Bluetooth) a odečítá ho.
9. **Mikrofon:** hraní bez MIDI (akustické piano, flétna, zpěv).
   - Na začátku je potřeba chvilka ticha na změření šumu.
   - Aplikace ví, kterou notu čeká, a ověřuje jen ji.
   - Doprovod pouštěj do sluchátek, jinak ho mikrofon uslyší.
   - Ověřené zatím jen na umělých signálech.
10. **Doplňky:**
    - *O písničce* popíše tóninu, rozsah, opakování a těžká místa.
    - *Klepnutí na notu* nabídne otázky k ní (jaký je to tón, jak dlouho trvá, do jakého akordu patří…).
    - *Jak to znělo?* ve výsledcích je zpětná vazba k přednesu podle síly úhozu a frázování. Ve „Všech notách“
      porovná sílu úhozu s dynamikou v notách: kde se značka mění (p → f), musí se změnit i síla.
    - *Vymysli písničku* složí novou písničku na zvolené téma, jen z tónů C–G nebo C dur.
    - *Týden* je souhrn cvičení hráče.
    - *Ozvěna* je hra: aplikace zahraje kousek písně a hráč ho zopakuje.

    Texty skládá kód z faktů o písničce a o cvičení; dětem kratšími větami.

## Klavír přes MIDI
MIDI v prohlížeči umí jen **Chrome a Edge** (Mac, Windows, Linux, Android); prohlížeč se jednou zeptá na povolení.
Bluetooth na Macu: Nastavení Audio MIDI → Okno → Zobrazit MIDI studio → ikona Bluetooth → u klavíru **Připojit**
(klavír musí být zapnutý a nesmí být spojený s jiným zařízením, např. s telefonem; když je „offline“, vypni ho a zapni).
Rusalka klavír najde sama (zelená tečka vpravo nahoře). Safari a prohlížeče na iPadu MIDI neumí: hraje se na klávesy
na obrazovce nebo s mikrofonem.

## Kde jsou data
- **V prohlížeči** (výchozí, IndexedDB): písničky, hráči, jejich nastavení, výsledky, statistiky. **Stáhnout zálohu** je stáhne jako `.zip`,
  **Obnovit ze zálohy** je nahraje zpět (i do jiného prohlížeče), stejně jako zip celé složky `Rusalka`. Obojí je v **Nastavení → Data a zálohy**.
- **Ve složce** (Chrome, Edge): **Ukládat do složky…** a vybrat složku, doporučeně `~/Rusalka` (Dokumenty se často
  synchronizují přes iCloud, který při souběhu dělá kopie souborů). Prázdnou složku aplikace nabídne naplnit daty
  z prohlížeče. Po restartu prohlížeče se může zeptat znovu (**Povolit přístup ke složce**). Rozložení:
  `rusalka.json`, `pisne/`, `data/*.json`, `zalohy/` (původní soubory před úpravou v editoru).
  Když se soubor s daty mezitím změnil jinde (jiný tab, jiný počítač), aplikace ho před zápisem sloučí.
- **Ukázky** (volná díla, `songs/`) jsou součástí webu a Rusalka je ukazuje jako písničky z knihovny na jejich
  policích. Vlastní písnička se stejným jménem souboru má přednost. Písničky z knihovny, které hráč odebral z Domova, si aplikace pamatuje pro každého
  hráče v `data/knihovnaSkryte.json`.

## Noty z papíru
- **Audiveris** (zdarma) převede čisté PDF not na MusicXML; výsledek zkontroluj v editoru.
- **AI chat** (Claude, ChatGPT…): **AI** (vpravo nahoře) **→ Noty z fotky → Zkopírovat pokyny**,
  vložit do chatu s fotkou nebo PDF a odpověď vložit zpět přes **Vložit noty z AI chatu**. Odpověď je textový
  zápis (`plugin/skills/rusalka-sheet-music/references/format.md`, jeden takt na řádek; parser je ve `static/lib/notation.js`,
  texty pokynů ve `static/lib/helper.js`, popis formátu se generuje do `static/lib/format.js`). Rusalka vypíše chyby
  zápisu s čísly řádků; správný zápis otevře v editoru nové písničky (délky taktů, vykreslení, uložení). **Přidat
  písničku** přijme i soubor `.txt` se zápisem.
- **Přehled týdne → Zkopírovat výsledky** dá do schránky posledních 7 dní hráčů (písničky, pokusy, přesnost,
  rychlost, těžké takty) a pokyny pro přehled; **Lehčí verze** (u vybrané písničky) přidá
  k pokynům zápis písničky.
- **Skilly** (volitelné, `plugin/skills/`): `rusalka-sheet-music` (přepis; se spouštěním kódu používá `scripts/sheet.mjs`:
  `slice` – zvětšené osnovy ke čtení, `check` – chyby zápisu, délky taktů, MusicXML a obrázek s čísly taktů,
  `text` – MusicXML na zápis, `add` – do složky Rusalky) a `rusalka-progress` (přehled ze zkopírovaných výsledků).
  `npm run skills` sestaví `build/rusalka-sheet-music.zip` a `rusalka-progress.zip`;
  `npm run web` je dá na web do `helper/`.

Skill má vlastní kopie `static/lib/song.js`, `note_names.js` a `notation.js` (obnoví je `npm run skill`, test hlídá,
že jsou aktuální).

## Písničky a autorská práva
Repozitář obsahuje jen volná díla (`songs/`, generuje `tools/samples.mjs`). Vlastní a chráněné písničky patří do
`private/` (je v `.gitignore`) nebo jen do složky Rusalky.

## Vývoj
```
npm install && npm run vendor      # Verovio do static/vendor
npm test                           # testy modulů v static/lib (node --test)
npm run dev                        # vývojový server http://localhost:8765 (statika + songs/)
npm run library                    # kontrola knihovny písniček (library/) a sestavení build/library/ (index.json, stránka ke kontrole)
npm run web                        # statický web do web/ (vendor, ukázky, songs/index.json, knihovna)
npm run skill                      # kopie song.js / note_names.js / notation.js ve skillu a static/lib/format.js
npm run skills                     # zipy se skilly do build/
node tools/samples.mjs             # znovu vygeneruje ukázkové písničky (volná díla) v songs/; pak npm run song-list
```
Vydání: tag `v*` spustí `.github/workflows/release.yml` – sestaví zipy se skilly a připraví
koncept vydání; zveřejní ho člověk.

Prerekvizity: Node.js 18+. Web na GitHub Pages sestaví a nasadí `.github/workflows/pages.yml` (zapíná se
v nastavení repozitáře: Pages → Source: GitHub Actions).

## Architektura
- **`static/lib/`** – čisté moduly bez DOM, pokryté testy:
  - `song.js` – model písničky, MusicXML ↔ model, kontrola taktů, rozvinutí repetic;
  - `levels.js` – úrovně, transpozice, harmonizace, prstoklad;
  - `practice.js` – fráze, souhrn a hodnocení pokusu (hvězdy, nejlepší výsledky), statistiky, plán tempa a smyčka
    úseku, plán průvodce, trenér;
  - `game.js` – režimy hry (`REZIM`), časovače hry, jeden snímek běžící hry, stisky v Najdi noty, kroky průvodce;
  - `editor.js` – operace editoru a historie;
  - `compare.js` – porovnání přepisu s ověřenou písničkou (přesnost převodu);
  - `microphone.js` – rozpoznání tónů z mikrofonu (MPM, spektrum, nástupy);
  - `natural.js` – zvířátka v pohybu (sada V13, 18 zvířátek): původní kresba ohýbaná na síti ve WebGL (oči se podívají
    dřív a hlava je následuje, pružné uši, srst a peří, víčka přes podkresbu, pusa se při radosti otevře; tlapky
    zůstávají na místě); kresby ve `static/animals/v13/`, data riggu ve `static/animals/v13.js` (generuje
    `node tools/animals.mjs <složka sady>`);
  - `extras.js` – fakta a texty doplňků, styly doprovodu, nová písnička, Ozvěna;
  - `midi_file.js` – čtení souborů MIDI a převod stop na noty;
  - `original.js` – původní MusicXML pro úroveň Všechny noty (první part, rozvinuté repetice, atributy po skocích);
  - `render.js` – noty pro hru z Verovia (řádek nebo stránka, časy, osnovy, dynamika z not);
  - `difficulty.js` – odhad obtížnosti pro knihovnu;
  - `library.js` – knihovna písniček: úroveň hráče, pořadí na polici, které písničky z knihovny jsou na Domově, další
    navržená písnička, hledání;
  - `storage.js` + `merge.js` – data v IndexedDB nebo ve složce (File System Access), sloučení, záloha;
  - `files.js` + `zip.js` – čtení MusicXML a `.mxl`, názvy písniček, jména souborů, ZIP;
  - `midi_output.js` – zvuk do klavíru přes Web MIDI (kanál 2, fronta s předstihem 100 ms);
  - `accompaniment.js`, `pair.js` – doprovod podle taktu, hraní ve dvou.
- **`static/app.js`** – hra:
  - noty kreslí Verovio v jednom řádku z rozvinutého modelu;
  - režimy a zvuk (Web Audio);
  - MIDI: Web MIDI (vstup i výstup do klavíru), data přes `lib/storage.js`, ukázky z `songs/index.json`.
- **`static/ui/`** – rozhraní:
  - `editor.js` – editor not;
  - `microphone.js` – mikrofon jako náhrada MIDI;
  - `animals.js` – pohyb zvířátek: kresba v pohybu, kde funguje WebGL a obrázek je dost velký, jinak pohyb přes CSS;
  - `extras.js` – okna doplňků.
- **`plugin/`** – skilly (`skills/rusalka-sheet-music`, `skills/rusalka-progress`); Rusalka se nevydává jako plugin,
  jen jako skilly (zipy a pro Claude Code a Codex odkazy podle `INSTALL-AGENT.md`).
- **`tools/`** – vývojový server, sestavení webu a skillů, seznam ukázek; `library.mjs` kontroluje
  a sestavuje knihovnu písniček (`npm run library`, viz `library/README.md`).
