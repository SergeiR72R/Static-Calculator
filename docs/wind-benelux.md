# Wind in the Benelux countries (scaffold mode)

Data behind `src/scaffold/windBenelux.ts`. Tags: **[C]** confirmed in a primary or reputable
secondary source; **[BC]** recomputed from a published table; **[I]** inference or map reading.

## Netherlands – NEN-EN 1991-1-4 + NB

- Wind areas (figure NB.1 / table NB.1) [C]:
  - I, v_b,0 = 29.5 m/s: Markermeer, IJsselmeer, Waddenzee, Wadden islands, Noord-Holland north of
    the municipalities Heemskerk, Uitgeest, Wormerland, Purmerend and Edam-Volendam;
  - II, 27.0 m/s: rest of Noord-Holland, mainland Groningen and Friesland, Flevoland, Zuid-Holland,
    Zeeland;
  - III, 24.5 m/s: Drenthe, Overijssel, Gelderland, Utrecht, Noord-Brabant, Limburg.
- Encoding [I]: by province (ISO 3166-2 code or name). Only Noord-Holland is split, by municipality.
  The five named municipalities are on the area II side. Beemster (in Purmerend since 2022) and
  Zeevang (in Edam-Volendam since 2016) lay north of the line, so their villages are area I.
  Purmerend and Edam-Volendam themselves are marked "to be confirmed".
- q_p: table NB.4 "extreme stuwdruk" (kust = category 0, onbebouwd = II, bebouwd = III; no coast
  column in area III) [C]. Published check value: 7 m, area III, onbebouwd: 0.62 kN/m².
  - The NB rule for heights between the table values was not found. The program rounds up to the
    next table height, which is on the safe side.
- c_dir = c_season = 1, c_o = 1 [C].

## Belgium – NBN EN 1991-1-4 ANB:2010

- v_b,0 = 23 / 24 / 25 / 26 m/s, decreasing from the coast to the south-east.
  - The ANB gives it as a map (figure 4.3 ANB) and by municipality (table 4.2 ANB) [C].
  - Altitude is included in v_b,0 [C].
- Table 4.2 ANB (the list by municipality) is not available here.
  - The program uses the province, read from the ANB map [I].
  - Where a province has two values, the higher one is taken and the user is asked to confirm:
    - West-Vlaanderen 26 (Kortrijk 25);
    - Oost-Vlaanderen 26 (Sint-Niklaas, Dendermonde, Aalst, Oudenaarde 25);
    - Hainaut 25 (Charleroi, Thuin 24);
    - Namur 24 (south of Dinant 23);
    - Liège 24 (south and east of Verviers 23).
  - Antwerpen, Limburg, Vlaams-Brabant, Brussels and Brabant wallon are 25; the province of
    Luxembourg is 23.
- q_p: EN 1991-1-4 (4.8) with the EN terrain categories.
  - c_dir = c_season = 1 (on the safe side). The ANB allows c_dir < 1 by direction and c_season
    < 1 for works shorter than one year [C].
  - k_I = 1, on the safe side. The ANB formula gives k_I ≤ 1 [BC].

## Luxembourg – ILNAS-EN 1991-1-4/AN-LU:2020

- One value for the whole country: v_b,0 = 24 m/s. This comes from a single secondary source
  (Dlubal), so the confirmation is weak.
- To be checked against the AN-LU text, which is free of charge in the ILNAS e-Shop.

## Sources

- NL areas and terrain: https://vebidak.nl/wp-content/uploads/2023/12/VB-208-Rekenen-aan-wind-TZ-A_P_-lAmie1.pdf
- NL table NB.4: https://kvt-online.nl/het-eindproduct/18-algemene-uitgangspunten-voor/18-b1-tabel-nb-4-extreme-stuwdruk-in-kn-m-als-functie-van-de-hoogte
- NL c_dir / c_season / example 0.62 kN/m²: https://repository.officiele-overheidspublicaties.nl/externebijlagen/exb-2018-30154/1/bijlage/exb-2018-30154.pdf
- BE parameters (c_dir, c_season, c_prob, terrain): https://www.buildwise.be/media/d3vj3ghx/nbn-en-1991-1-4.pdf
- BE map of v_b,0: https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/2_EU_MS_Case_Study_2-Belgium.pdf
- BE check points (Turnhout 25, Dinant 24): https://www.sabprofiel.nl/wp-content/uploads/2024/02/Windlastentabel-BE.pdf, https://eurocodes-tools.com/en/wind-zones-map-belgium/
- LU: https://www.dlubal.com/en/load-zones-for-snow-wind-earthquake/wind-ilnas-en-1991-1-4.html, https://ilnas.services-publics.lu/ecnor/displayStandard.action?id=218664&request_locale=en
