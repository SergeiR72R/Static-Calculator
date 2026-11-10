# PERI UP Flex — Bemessungsdaten für das Stabwerksmodell

Quelle: allgemeine bauaufsichtliche Zulassung Z-8.22-863 vom 22.09.2025 (DIBt, öffentlich:
https://www.dibt.de/pdf_storage/2025/Z-8.22-863(1.8.22-3!25).pdf), Abschnitt 3.2 und Anlage A.
Einheiten wie in der Zulassung: N, V in kN, M in kNcm, φ in rad, δ in mm bzw. cm.
Lokales System am Knoten: x = Riegelachse, z = Ständerrohrachse.

## Varianten (Tabelle 6)

| Variante | Rosette | Stielrohr | Beispiele |
|---|---|---|---|
| 1a | Rosette 160×130×8 mm S355 | Ø 48,3×3,2 S235/320 | UVR, UVH |
| 1b | Rosette 8 mm | Ø 48,3×3,6 S355 | UVB 24, UVB 49, UVB 135 Plus, UVH 165 Plus |
| 2a | Rosette-2 152×120×6 mm S460 | Ø 48,3×3,2 S235/320 | |
| 2b | Rosette-2 6 mm | Ø 48,3×3,6 S355 | UVB 25, UVB 50 |
| 2c | Rosette-2 6 mm | Ø 48,3×2,7 S235/320 | UVR-2, UVH-2 |

Ist nicht sichergestellt, welche Variante verbaut ist: ungünstigste ansetzen.

## Riegelanschluss: Last-Verformung (3.2.2.2, Anlage A S. 1–15)

Biegung in der vertikalen Ebene, My/φ (Tabelle 7): φ = My / (a ∓ b·My)

| Variante | Riegel | My > 0: φ = M/(a − b·M) | Bereich | My < 0: φ = M/(a + b·M) | Bereich |
|---|---|---|---|---|---|
| 1a | UH / UHD | a = 11250, b = 45,9 | 0…100 | a = 16900, b = 152 | −100…0 |
| 1b | UH / UHD | 12550, 54,9 | 0…110 | 16160, 136 | −110…0 |
| 1a | UH Plus / UH-2 | 17100, 65,6 | 0…175 | 13150, 66,6 | −145…0 |
| 1b | UH Plus / UH-2 | 14900, 40,3 | 0…250 | 12000, 56,6 | −175…0 |
| 2a, 2b | UH / UHD | 11250, 45,9 | 0…100 | 16900, 152 | −100…0 |
| 2a, 2b | UH Plus / UH-2 | 20000, 87,0 | 0…175 | 11700, 53,2 | −145…0 |
| 2c | UH / UHD | 8040, 45,9 | 0…80 | 12910, 152 | −80…0 |
| 2c | UH Plus / UH-2 | 21300, 130 | 0…125 | 14100, 98,0 | −115…0 |

(a ist die Anfangssteifigkeit in kNcm/rad.)

Biegung in der horizontalen Ebene, Mz/φ (Tabelle 8): φ = Mz / (a − b·|Mz|)

| Rosette | Riegel | a | b |
|---|---|---|---|
| 8 mm | UH / UHD / UH Plus / UH-2 | 1440 | 26,6 |
| 6 mm | UH / UHD | 1440 | 26,6 |
| 6 mm | UH Plus / UH-2 | 520 | 1,33 |

Vertikale Querkraft, Wegfeder cz (Tabelle 9; nur Riegel mit UBL-Diagonale / ST 100 und alle Riegel L = 25 cm), δ in mm:

- Rosette 8 mm: Zug 0 < Fz < 15: δ = Fz/(31,5 − 1,89·Fz); Druck −5 ≤ Fz < 0: δ = Fz/60; Fz < −5: δ = Fz/10 + 0,4167
- Rosette 6 mm: Zug 0 < Fz < 15: δ = Fz/(8 − 0,39·Fz); Druck −33 ≤ Fz < 0: δ = Fz/(36 + 0,96·Fz)

Torsion, Mx/φ (Tabelle 10, alle Varianten): φ = Mx / (a − b·|Mx|)

| Riegel | a | b |
|---|---|---|
| UH / UHD | 3500 | 96,0 |
| UH Plus / UH-2 | 4700 | 77,9 |

## Statisches System der Anschlüsse (Anlage A S. 16–26)

- Riegelanschluss UH / UH Plus / UH-2 (S. 16): Drehfeder cφ in der Riegelachse, e_x = 2,5 cm vor der
  Ständerachse und e_z = 3,5 cm über der Rosettenebene; das kurze Stück Ständerachse → Feder starr
  (E·I ≈ ∞, E·A ≈ ∞). UHD: e_z = 4,5 cm. Wegfeder cz nur für Riegel L ≤ 25 cm (und Riegel mit UBL).
- My > 0: Zug an der Riegelunterseite am Anschluss (Riegel hängt durch → negatives Anschlussmoment),
  Vorzeichen siehe Anlage A S. 16.
- My,Rd ist auf die Außenkante des Ständerrohrs bezogen (3.2.1).
- Verbandsdiagonale UBS (S. 18/19): gelenkig, e_x = 2,8 cm, e_y = 2,8 cm; Lose f0 = 0,10 cm
  (Rosette 8 mm) bzw. 0,30 cm (Rosette 6 mm).
- Knotendiagonale UBK / UBK-2 (S. 20): gelenkig, e_x = 8,3 cm, e_y = 3,6 cm (UBK) bzw. 5,0 cm (UBK-2);
  Lose f0 = 1,0 cm (Rosette 8 mm). Knotenmomente aus N_V: Mx = e_y·N·sinα, My = 8,3·N·sinα,
  Mz = e_y·N·cosα (vom Ständer und den Riegeln aufzunehmen).
- In den Diagonalen nur Normalkräfte (3.2.1).

## Riegelanschluss: Beanspruchbarkeiten (Tabelle 11, Bemessungswerte)

| Variante | Größe | UH / UHD | UH Plus / UH-2 |
|---|---|---|---|
| 1a (Ø48,3×3,2, R 8 mm) | My,Rd+ / My,Rd− [kNcm] | +93,3 / −89,1 | +161 / −136 |
| 1a | N,Rd [kN] | ±24,7 | ±37,3 |
| 1a | Vz,Rd+ [kN] | +30,4 | +30,4 |
| 1b (Ø48,3×3,6, R 8 mm) | My,Rd+ / My,Rd− | +100,0 / −100,0 | +175 / −136 |
| 1b | N,Rd | ±24,7 | ±37,3 |
| 1b | Vz,Rd+ | +30,4 | +30,4 |
| 2a, 2b (R-2 6 mm) | My,Rd+ / My,Rd− | +93,3 / −89,1 | +158 / −136 |
| 2a, 2b | N,Rd+ (Zug) | UH +24,7; UHD +19,8 | +29,4 |
| 2a, 2b | N,Rd− (Druck) | −24,7 | −37,3 |
| 2a, 2b | Vz,Rd+ | +28,9 | +28,9 |
| 2c (Ø48,3×2,7, R-2 6 mm) | My,Rd+ / My,Rd− | +66,7 / −68,1 | +113 / −107 |
| 2c | N,Rd+ / N,Rd− | UH ±24,7; UHD +19,8 / −23,9 | ±29,4 |
| 2c | Vz,Rd+ | +28,9 | +28,9 |
| alle | Vz,Rd− [kN] | −13,4 | −13,9 |
| alle | Vy,Rd [kN] | ±11,3 | ±18,5 |
| alle | Mz,Rd [kNcm] | ±34,5 | ±33,9 |
| alle | Mx,Rd [kNcm] | ±25,6 | ±41,0 |

## Nachweise am Knoten (3.2.2.3)

Interaktion Ständerrohr / Riegelanschluss (Gl. 1): α∓·I_A∓ + I_S ≤ 1 mit I_A = My,Ed/My,Rd (Gl. 2) und
I_S = vektorieller Ausnutzungsgrad des Ständerrohrs auf Höhe der Rosette (Schnittgrößen unter- bzw.
oberhalb der Rosette, Cosinus-Interaktion m = cos(π/2·n), I_S = a/b im n-m-Diagramm; gilt für
v_act = V/V_Rd ≤ 1/3).

Tabelle 12, Faktoren α:

| Variante | UH/UHD α+ = α− | UH Plus/UH-2 α+ | α− |
|---|---|---|---|
| 1a, 2a | 0,29 | 0,20 | 0,22 |
| 1b, 2b | 0,10 | 0,03 | 0,05 |
| 2c | 0,50 | 0,30 | 0,40 |

Ständerrohr (γM = 1,1, red α_pl = 1,25):

| Rohr | N_Rd [kN] | M_Rd [kNcm] | V_Rd [kN] |
|---|---|---|---|
| Ø48,3×2,7 S235/320 | 113 | 152 | 41,4 |
| Ø48,3×3,2 S235/320 | 132 | 174 | 48,5 |
| Ø48,3×3,6 S355 | 163 | 212 | 60,0 |

Interaktion im Anschluss, UH / UHD (Gl. 5/6, alle Varianten gleich):
- (a) N/N_Rd + My+/My,Rd+ + Vz+/Vz,Rd+ + 0,60·Vy/Vy,Rd + 0,95·Mz/Mz,Rd ≤ 1
- (b) N/N_Rd + My−/My,Rd− + Vz−/Vz,Rd− + 0,60·Vy/Vy,Rd + 0,95·Mz/Mz,Rd ≤ 1
- (c) N+/N_Rd + Mx/Mx,Rd + Mz/Mz,Rd ≤ 1

Interaktion im Anschluss, UH Plus / UH-2, alle Varianten (Gl. 7), X = max(Vy/Vy,Rd, Mz/Mz,Rd):
- (7a) My+/My,Rd+ + Vz+/Vz,Rd+ + X ≤ 1
- (7b) N−/N_Rd + My+/My,Rd+ + X ≤ 1
- (7c) My−/My,Rd− + Vz−/Vz,Rd− + X ≤ 1
- (7d) N+/N_Rd + Mx/Mx,Rd + Mz/Mz,Rd ≤ 1

zusätzlich Variante 1a, 1b (Gl. 8):
- (8a) N+/N_Rd + 0,97·My−/My,Rd− + 0,23·Vz+/Vz,Rd+ + X ≤ 1
- (8b) N+/N_Rd + 0,43·My−/My,Rd− + 0,66·Vz+/Vz,Rd+ + X ≤ 1
- (8c) N+/N_Rd + My−/My,Rd− + 0,58·Vz−/Vz,Rd− + X ≤ 1

zusätzlich Variante 2a, 2b (Gl. 9):
- (9a) N+/N_Rd + 0,97·My−/My,Rd− + 0,23·Vz+/Vz,Rd+ + X ≤ 1
- (9b) N+/N_Rd + 0,37·My−/My,Rd− + 0,71·Vz+/Vz,Rd+ + X ≤ 1
- (9c) N+/N_Rd + My−/My,Rd− + X ≤ 1

zusätzlich Variante 2c (Gl. 10):
- (10a) N+/N_Rd + 0,29·My−/My,Rd− + 0,71·Vz+/Vz,Rd+ + X ≤ 1
- (10b) N+/N_Rd + My−/My,Rd− + X ≤ 1

(N+ Zug, N− Druck; My+ / My− und Vz+ / Vz− nach Vorzeichen, jeweils Beträge der Verhältnisse.)

Riegelquerschnitt 50 mm von der Ständerachse (Gl. 11/12, Tabelle 13), u = max(u12a…e) ≤ 1:
n* = n_x + m_z, v* = √((v_z + m_x)² + v_y²);
u12a = 1,00·n* + 0,90·m_y; u12b = 0,89·n* + 0,80·m_y + 0,33·v*; u12c = 0,88·m_y + 0,37·v*;
u12d = m_y; u12e = v*.

| Riegel | N_w,Rd [kN] | M_w,y,Rd [kNcm] | V_w,z,Rd [kN] | M_w,x,Rd [kNcm] | M_w,z,Rd [kNcm] | V_w,y,Rd [kN] |
|---|---|---|---|---|---|---|
| UH Plus / UH-2, RHP 60×30×2,0 | 80,4 | 123 | 41,0 | 89,8 | 109 | 46,4 |
| UH Plus, RHP 60×30×3,0 | 117 | 175 | 60,0 | 129 | 154 | 67,6 |
| UH-2, RHP 60×30×2,4 | 95,2 | 144 | 48,6 | 106 | 128 | 55,0 |

Riegelaufnahme UHA halb: Riegelanschluss gelenkig, V_z,Rd+ = 12,7 kN (3.2.2.1.4).
Halbrosetten der Konsolen UCM: wie Variante 1a, für My < 0 gelenkig (3.2.2.1.3).

## Vertikale Diagonalen (3.2.3)

Im Gesamtsystem mit der Gesamtsteifigkeit Ed·Aeff (Rohr inklusive Anschlüsse) und einer Lose f0; Nachweis N_V,Ed / N_V,Rd ≤ 1 (Gl. 13).

Knotendiagonale UBK / UBK-2 (Tabelle 15), zusätzlich Lose 1,2 cm (bzw. 1,0 cm an 8 mm-Rosetten nach Anlage A S. 20). Ed·Aeff [kN], N_Rd [kN]:

| L × H [m] | Zug R8: EA | N_Rd+ | Zug R6: EA | N_Rd+ | Druck R8: EA | N_Rd− | Druck R6: EA | N_Rd− |
|---|---|---|---|---|---|---|---|---|
| 1,00 × 1,50 | 5250 | 14,6 | 3150 | 10,2 | 5200 | 13,8 | 3640 | 9,70 |
| 1,50 × 1,50 | 6320 | 17,2 | 3790 | 12,0 | 4200 | 15,0 | 2940 | 10,5 |
| 2,00 × 1,50 | 7830 | 16,1 | 4700 | 11,3 | 3710 | 12,2 | 2600 | 8,60 |
| 2,50 × 1,50 | 9460 | 15,3 | 5680 | 10,7 | 3310 | 9,58 | 2320 | 6,70 |
| 3,00 × 1,50 | 11710 | 14,5 | 7030 | 10,2 | 2890 | 7,54 | 2020 | 5,30 |
| 2,00 × 2,00 | 8120 | 17,0 | 4870 | 11,9 | 3340 | 10,0 | 2340 | 7,00 |
| 2,50 × 2,00 | 9400 | 16,2 | 5640 | 11,3 | 2910 | 8,17 | 2040 | 5,70 |
| 3,00 × 2,00 | 10790 | 15,7 | 6470 | 11,0 | 2700 | 6,52 | 1890 | 4,60 |
| 1,50 × 0,50 | 1970 | 10,2 | 1910 | 10,3 | 2020 | 10,1 | 750 | 10,3 |
| 2,00 × 0,50 | 2580 | 9,77 | 2500 | 9,98 | 2710 | 9,77 | 970 | 9,98 |
| 2,50 × 0,50 | 3160 | 9,64 | 3080 | 9,85 | 2540 | 9,62 | 1070 | 9,62 |
| 3,00 × 0,50 | 3740 | 9,58 | 3660 | 9,78 | 2600 | 6,64 | 1240 | 6,64 |
| 1,00 × 1,00 | 2210 | 13,2 | 2050 | 9,88 | 1140 | 12,2 | 730 | 7,62 |
| 1,04 × 1,00 | 2460 | 13,2 | 2360 | 10,3 | 1700 | 12,4 | 1140 | 7,77 |
| 1,25 × 1,00 | 2200 | 13,2 | 2070 | 11,4 | 1400 | 12,0 | 790 | 8,62 |
| 1,50 × 1,00 | 2460 | 12,7 | 2250 | 12,6 | 1970 | 11,8 | 850 | 9,75 |
| 2,00 × 1,00 | 2920 | 11,6 | 2780 | 11,5 | 2380 | 10,7 | 1090 | 11,0 |
| 2,50 × 1,00 | 3420 | 10,8 | 3300 | 10,7 | 2590 | 8,52 | 1200 | 8,52 |
| 3,00 × 1,00 | 3960 | 10,0 | 3830 | 10,2 | 2280 | 6,09 | 1310 | 6,09 |
| 1,50 × 1,50 | 3190 | 13,2 | 3010 | 10,5 | 1570 | 11,3 | 1090 | 7,83 |
| 2,00 × 1,50 | 3460 | 13,1 | 3130 | 13,0 | 2220 | 9,74 | 1310 | 9,24 |
| 2,50 × 1,50 | 3860 | 12,1 | 3640 | 12,0 | 2210 | 7,15 | 1380 | 7,15 |
| 3,00 × 1,50 | 4320 | 11,5 | 4120 | 11,3 | 1970 | 5,32 | 1660 | 5,32 |

Verbandsdiagonale UBS (Tabelle 14), zusätzlich Lose 0,1 cm (R 8 mm) bzw. 0,3 cm (R 6 mm):

| L × H [m] | Zug R8: EA | N_Rd+ | Zug R6: EA | N_Rd+ | Druck R8: EA | N_Rd− | Druck R6: EA | N_Rd− |
|---|---|---|---|---|---|---|---|---|
| 1,00 × 1,00 | 4550 | 16,8 | 2730 | 11,8 | 4670 | 14,9 | 3270 | 10,4 |
| 1,50 × 1,00 | 6130 | 15,8 | 3680 | 11,1 | 4790 | 15,8 | 3350 | 11,1 |
| 2,00 × 1,00 | 8110 | 14,5 | 4870 | 10,2 | 4080 | 14,4 | 2860 | 10,1 |
| 2,50 × 1,00 | 10470 | 14,0 | 6280 | 9,80 | 3070 | 10,9 | 2150 | 7,60 |
| 3,00 × 1,00 | 12640 | 13,7 | 7580 | 9,80 | 3140 | 8,40 | 2200 | 5,90 |

## Horizontale Diagonalen (3.2.4)

Horizontaldiagonale UBH Flex (Tabelle 19): Ed·Aeff [kN], zusätzlich Lose f0 = 0,2 cm; N_H,Rd = 11,20 kN (L ≤ 2,00 m und 2,50/3,00 m außer 3,00 × 3,00), 11,10 kN (3,00 × 3,00). Nachweis N_H,Ed/N_H,Rd ≤ 1 (Gl. 14).

| L × B [m] | Ed·Aeff [kN] |
|---|---|
| 1,00 × 1,00 | 6900 |
| 1,25 × 1,00 | 7430 |

## Ständerstöße (3.2.8)

- Tragmodell „Übergreifstoß“ (UVR / UVR-2 untereinander, mit UVH / UVH-2, vereinfacht auch UVB – UVR / UVH):
  Drehfeder c = 12 900 kNcm/rad, M_Rd = 113 kNcm (Nettoquerschnitte berücksichtigt).
- „Kontaktstoß“: starr, Druckbeanspruchbarkeit N_D,Rd = 100 kN.
- Hybridtragmodell (Tabelle 28): Verdrehlose φ0 = 0,0260 (S02, S03, S11, S23, S33, S42, S43) …
  0,0100 rad; c = 12 900 kNcm/rad; M_SB,Rd = 113 kNcm; N_D,Rd = 100 kN.
- Zugstoß (Tabelle 26), Ständer Ø48,3×3,2 / ×3,6: Bolzen Ø48/57 bzw. M10-8.8: 31,0 kN (1 Vbm),
  47,0 kN (2 Vbm); Ständer Ø48,3×2,7: 18,4 / 36,8 (Bolzen), 17,9 / 35,8 (M10-8.8), 23,6 / 47,0 (M10-10.9).

## Gesamtsystem (3.2.9)

- Beläge: UDG 25 geschweißt/genietet: Feldweite 3,0 m LK 4; 2,5 m LK 5; 2,0 m LK 6 (Tabelle 29).
- Werkstoff: S235JRH mit ReH ≥ 320: f_y,d = 291 N/mm²; S355J2H mit ReH ≥ 400: f_y,d = 363,6 N/mm².
- Gerüstspindeln UJB / UJS: A = 4,36 cm², I = 4,96 cm⁴, W_el = 3,23 cm³, red W_pl = 4,04 cm³;
  Cosinus-Interaktion nach DIN 4425.
- Halbkupplungen: Beanspruchbarkeiten und Steifigkeiten nach DIN EN 74-2.
- Verankerung: Raster und Ankerkräfte aus dem Standsicherheitsnachweis; Gerüsthalter übertragen
  keine Vertikalkräfte (3.3.3.7).
- Kupplungen: Anzugsmoment 50 Nm.

## Querschnitte (Tabellenbuch PERI UP 05/2021, S. 10–11)

| Profil | Verwendung | f_y | A [cm²] | I_y [cm⁴] | I_z [cm⁴] | g [kg/m] | N_Rd [kN] | M_y,Rd [kNcm] | M_z,Rd | V_y,Rd | V_z,Rd |
|---|---|---|---|---|---|---|---|---|---|---|---|
| RHP 60×30×2 S235 | UH | 235 | 3,34 | 15,05 | 5,08 | 2,70 | 71,1 | 134,7 | 83,1 | 13,7 | 27,4 |
| RHP 60×30×2 S355 | UH Plus / UH-2 | 355 | 3,34 | 15,05 | 5,08 | 2,70 | 107,4 | 202,4 | 125,5 | 20,7 | 41,4 |
| RHP 60×30×3 S355 | UH Plus / UHV | 355 | 4,81 | 20,50 | 6,80 | 4,05 | 155,2 | 275,3 | 173,9 | 29,8 | 59,9 |
| RHP 60×30×2,4 S460MH | UH-2 / UHV-2 / UHE | 460 | 3,94 | 17,38 | 5,83 | 3,19 | 164,8 | 302,2 | 189,0 | 31,7 | 63,4 |
| Ø48,3×3,2 S235/320 | UVR / UVH / UVH-2 | 320 | 4,53 | 11,59 | 11,59 | 3,56 | 131,9 | 174,5 | 174,5 | 48,5 | 48,5 |
| Ø48,3×2,7 S460MH | EVM / EVS … | 460 | 3,87 | 10,1 | 10,1 | 2,91 | 162,0 | 218,0 | 218,0 | 59,5 | 59,5 |
| Ø48,3×3,6 S355 | UVB / EVH / EVT | 355 | 5,06 | 12,71 | 12,71 | 3,98 | 163,5 | 212,3 | 212,3 | 60,0 | 60,0 |
| Ø48,3×2,7 S235/320 | UVR-2 | 320 | 3,87 | 10,1 | 10,1 | 2,91 | 112,7 | 151,7 | 151,7 | 41,4 | 41,4 |

E = 210 000 N/mm², G = 81 000 N/mm², γ_M = 1,1.
Zulässige Stielnormalkraft (Knicken, w0 = l/250, beidseitig gelenkig): zul N = κ·N_Rd/1,5.
Kupplungen EN 74-1 Klasse B: Normalkupplung RA zul. 9,1 kN (Rutschen), Drehkupplung SW 9,1 kN.

## DIN EN 12811-1 (Schulungsunterlage „DIN EN 12810 und DIN EN 12811“, PERI)

- Verkehrslasten Tabelle 3: LK 1…6 = 0,75 / 1,5 / 2,0 / 3,0 / 4,5 / 6,0 kN/m².
- Raumgerüste: q1 auf 6,0 m², Rest 0,75 kN/m² (hier nach Vorgabe: volle Last auf einer Lage).
- Arbeitsbetrieb: Eigenlast + Verkehrslast auf der maßgebenden Lage (+ 50 % auf einer Nachbarlage)
  + Arbeitswind (Staudruck 0,2 kN/m²) oder horizontale Ersatzlast (≥ 2,5 % der Verkehrslast je Feld,
  ≥ 0,3 kN), wenn kein Wind anzusetzen ist.
- Ruhebetrieb: Eigenlast + Anteil der Verkehrslast (LK 1: 0 %, LK 2–3: 25 %, LK 4–6: 50 %) + maximale
  Windlast (Standzeitfaktor ≥ 0,7).
- Aerodynamischer Beiwert unbekleidet c_f = 1,3; Lagebeiwert c_s nach Bild der Norm (parallel 1,0).
  Ersatzfläche auf der Belaglage: 400 mm (Arbeitswind) bzw. 200 mm (maximaler Wind) hoch.
- γ_F = 1,5 für alle ständigen und veränderlichen Einwirkungen (GZT), 1,0 (GZG).
- Imperfektionen: Knickwinkel ψ an den Ständerstößen (tan ψ ≥ 0,01; bei n nebeneinander stehenden
  Ständern reduziert: tan ψ_n = tan ψ · √(0,5 + 1/n)).
- Rohre: Cosinus-Interaktion M/M_pl ≤ cos(π/2 · N/N_pl) für V ≤ 1/3 V_pl.
