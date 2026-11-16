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

- Riegeldiagonale UBL / UBL-2 / ST100 (S. 22, 23): Diagonale E_d·A_eff = ∞ mit Feder c_d (Tabellen 16 /
  17) und Lose f_o = 0,2 cm; Anschluss am Riegel im Abstand X_u = X_o = 12,5 cm von der Ständerachse
  (UH-2: 8,5 / 12,5 / 16,5 cm), Exzentrizität e_y = 1,4 cm neben der Riegelachse (M_T = 1,4·N_V·sin α,
  M_z = 1,4·N_V·cos α). Alle vier Riegelanschlüsse (A_o, A_u, B_o, B_u) mit Wegfeder c_z nach der
  F_z/δ-Beziehung (S. 9: Rosette 8 mm, S. 10: Rosette 6 mm); F_z < 0: Druck in der Feder (Riegel drückt
  auf die Rosette).

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

Im Gesamtsystem mit der Gesamtsteifigkeit Ed·Aeff (Rohr inklusive Anschlüsse) und einer Lose f0; Nachweis N_V,Ed / N_V,Rd ≤ 1 (Gl. 13). Ed·Aeff und N_Rd in kN.

Knotendiagonale UBK / UBK-2 (Tabelle 15), zusätzlich Lose 1,2 cm (1,0 cm an 8 mm-Rosetten nach Anlage A S. 20):

| L × H [m] | Zug R8: EA | N_Rd+ | Zug R6: EA | N_Rd+ | Druck R8: EA | N_Rd− | Druck R6: EA | N_Rd− |
|---|---|---|---|---|---|---|---|---|
| 1.50 × 0.50 | 1970 | 10.2 | 1910 | 10.3 | 2020 | 10.1 | 750 | 10.3 |
| 2.00 × 0.50 | 2580 | 9.77 | 2500 | 9.98 | 2710 | 9.77 | 970 | 9.98 |
| 2.50 × 0.50 | 3160 | 9.64 | 3080 | 9.85 | 2540 | 9.62 | 1070 | 9.62 |
| 3.00 × 0.50 | 3740 | 9.58 | 3660 | 9.78 | 2600 | 6.64 | 1240 | 6.64 |
| 1.00 × 1.00 | 2210 | 13.2 | 2050 | 9.88 | 1140 | 12.2 | 730 | 7.62 |
| 1.04 × 1.00 | 2460 | 13.2 | 2360 | 10.3 | 1700 | 12.4 | 1140 | 7.77 |
| 1.25 × 1.00 | 2200 | 13.2 | 2070 | 11.4 | 1400 | 12 | 790 | 8.62 |
| 1.50 × 1.00 | 2460 | 12.7 | 2250 | 12.6 | 1970 | 11.8 | 850 | 9.75 |
| 2.00 × 1.00 | 2920 | 11.6 | 2780 | 11.5 | 2380 | 10.7 | 1090 | 11 |
| 2.50 × 1.00 | 3420 | 10.8 | 3300 | 10.7 | 2590 | 8.52 | 1200 | 8.52 |
| 3.00 × 1.00 | 3960 | 10 | 3830 | 10.2 | 2280 | 6.09 | 1310 | 6.09 |
| 1.50 × 1.50 | 3190 | 13.2 | 3010 | 10.5 | 1570 | 11.3 | 1090 | 7.83 |
| 2.00 × 1.50 | 3460 | 13.1 | 3130 | 13 | 2220 | 9.74 | 1310 | 9.24 |
| 2.50 × 1.50 | 3860 | 12.1 | 3640 | 12 | 2210 | 7.15 | 1380 | 7.15 |
| 3.00 × 1.50 | 4320 | 11.5 | 4120 | 11.3 | 1970 | 5.32 | 1660 | 5.32 |
| 0.72 × 2.00 | 3560 | 9.69 | 3090 | 6.07 | 1970 | 9.69 | 1350 | 6.07 |
| 0.75 × 2.00 | 3360 | 9.73 | 3060 | 6.09 | 1420 | 9.73 | 1120 | 6.09 |
| 1.00 × 2.00 | 3500 | 10.5 | 3230 | 6.69 | 1460 | 10.1 | 1190 | 6.34 |
| 1.04 × 2.00 | 3790 | 10.6 | 3340 | 6.8 | 2050 | 10.2 | 1460 | 6.38 |
| 1.25 × 2.00 | 3670 | 11.4 | 3470 | 7.44 | 1540 | 10.5 | 1270 | 6.65 |
| 1.50 × 2.00 | 3890 | 12.2 | 3750 | 8.35 | 1900 | 9.49 | 1310 | 7.03 |
| 2.00 × 2.00 | 4100 | 13.2 | 3920 | 10.8 | 1970 | 7.48 | 1820 | 7.48 |
| 2.50 × 2.00 | 4360 | 13.2 | 3960 | 13.2 | 1890 | 5.81 | 1720 | 5.81 |
| 3.00 × 2.00 | 4800 | 12.4 | 4450 | 12.3 | 1690 | 4.5 | 1520 | 4.5 |

Verbandsdiagonale UBS (Tabelle 14), zusätzlich Lose 0,1 cm (R 8 mm) bzw. 0,3 cm (R 6 mm):

| L × H [m] | Zug R8: EA | N_Rd+ | Zug R6: EA | N_Rd+ | Druck R8: EA | N_Rd− | Druck R6: EA | N_Rd− |
|---|---|---|---|---|---|---|---|---|
| 1.00 × 1.00 | 4550 | 16.8 | 2730 | 11.8 | 4670 | 14.9 | 3270 | 10.4 |
| 1.50 × 1.00 | 6130 | 15.8 | 3680 | 11.1 | 4790 | 15.8 | 3350 | 11.1 |
| 2.00 × 1.00 | 8110 | 14.5 | 4870 | 10.2 | 4080 | 14.4 | 2860 | 10.1 |
| 2.50 × 1.00 | 10470 | 14 | 6280 | 9.8 | 3070 | 10.9 | 2150 | 7.6 |
| 3.00 × 1.00 | 12640 | 13.7 | 7580 | 9.8 | 3140 | 8.4 | 2200 | 5.9 |
| 1.00 × 1.50 | 5250 | 14.6 | 3150 | 10.2 | 5200 | 13.8 | 3640 | 9.7 |
| 1.50 × 1.50 | 6320 | 17.2 | 3790 | 12 | 4200 | 15 | 2940 | 10.5 |
| 2.00 × 1.50 | 7830 | 16.1 | 4700 | 11.3 | 3710 | 12.2 | 2600 | 8.6 |
| 2.50 × 1.50 | 9460 | 15.3 | 5680 | 10.7 | 3310 | 9.58 | 2320 | 6.7 |
| 3.00 × 1.50 | 11710 | 14.5 | 7030 | 10.2 | 2890 | 7.54 | 2020 | 5.3 |
| 2.00 × 2.00 | 8120 | 17 | 4870 | 11.9 | 3340 | 10 | 2340 | 7 |
| 2.50 × 2.00 | 9400 | 16.2 | 5640 | 11.3 | 2910 | 8.17 | 2040 | 5.7 |
| 3.00 × 2.00 | 10790 | 15.7 | 6470 | 11 | 2700 | 6.52 | 1890 | 4.6 |

## Horizontale Diagonalen (3.2.4)

Horizontaldiagonale UBH Flex (Tabelle 19): Ed·Aeff [kN], zusätzlich Lose f0 = 0,2 cm; N_H,Rd = 11,20 kN (3,00 × 3,00: 11,10 kN). Nachweis N_H,Ed/N_H,Rd ≤ 1 (Gl. 14).

| L × B [m] | Ed·Aeff [kN] |
|---|---|
| 1.00 × 1.00 | 6900 |
| 1.25 × 1.00 | 7430 |
| 1.25 × 1.25 | 7840 |
| 1.50 × 0.67 | 7560 |
| 1.50 × 0.72 | 7610 |
| 1.50 × 0.75 | 7650 |
| 1.50 × 1.00 | 7920 |
| 1.50 × 1.04 | 7950 |
| 1.50 × 1.25 | 8150 |
| 1.50 × 1.50 | 8410 |
| 2.00 × 0.67 | 8410 |
| 2.00 × 0.72 | 8420 |
| 2.00 × 0.75 | 8420 |
| 2.00 × 1.00 | 8490 |
| 2.00 × 1.04 | 8490 |
| 2.00 × 1.25 | 8500 |
| 2.00 × 1.50 | 8520 |
| 2.00 × 2.00 | 8190 |
| 2.50 × 0.67 | 8470 |
| 2.50 × 0.72 | 8460 |
| 2.50 × 0.75 | 8450 |
| 2.50 × 1.00 | 8370 |
| 2.50 × 1.04 | 8350 |
| 2.50 × 1.25 | 8190 |
| 2.50 × 1.50 | 8010 |
| 2.50 × 2.00 | 7220 |
| 2.50 × 2.50 | 5850 |
| 3.00 × 0.67 | 7590 |
| 3.00 × 0.72 | 7560 |
| 3.00 × 0.75 | 7540 |
| 3.00 × 1.00 | 7330 |
| 3.00 × 1.04 | 7290 |
| 3.00 × 1.25 | 6990 |
| 3.00 × 1.50 | 6660 |
| 3.00 × 2.00 | 5510 |
| 3.00 × 2.50 | 3910 |
| 3.00 × 3.00 | 2310 |

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

## Abgleich mit PERI ForceControl (Berichte 18_011 und 18_012, „Eli Lilly“, RFEM 5)

Die Berechnung folgt den Ergebnissen von PERI ForceControl (Vorgabe: Ergebnisse möglichst
deckungsgleich). Abweichend von den Abschnitten oben:

- Diagonalen ohne Lose (FC rechnet ohne die Lose nach 3.2.3.2; mit 0,3 cm war die Verschiebung von
  18_011 68 mm statt 24 mm). Die Lose bleibt als Option (`diagSlack`).
- Globale Schiefstellung 1/200 (FC) statt ψ nach 10.2.2.2.
- Aerodynamischer Beiwert c_f = 1,2 (FC: Windfläche 18_012 96,4 / 68,7 m², hier 96,7 / 69,1 m²).
- Kombinationen: A (Arbeitsbetrieb, γ = 1,5), R (Ruhebetrieb, ständige γ = 1,5 + max. Wind) und
  S (Standsicherheit, ständige γ = 0,9 + max. Wind, ohne Verkehrslasten) – wie FC 18_012
  (LCC5–8 und LCC9–12).
- Theorie II. Ordnung ohne getrennten Knicknachweis mit χ (FC: Schnittgrößen II. Ordnung,
  Querschnitts- und Knotennachweise); mit Theorie I. Ordnung bleibt der χ-Nachweis.
- Fußpunkte einseitig: Abheben ist zulässig (Auflagerkraft 0); schrittweise (je Iteration die am
  stärksten gezogenen, > 0,1 kN). Nur ein Fußpunkt, der Zug halten muss (sonst kinematisch), ist ein
  Mangel.
- Fußspindel UJB 38: N/135 kN + M/149,5 kNcm (DIN 4420-1 Tab. 7; an 10 Werte der FC-Berichte
  angepasst, ±0,01). Kopfspindel (Spindelkopf SRU, Kreuzkopfspindel): N/N_c,Rd, N_c,Rd = 75 kN
  (EN 1993-1-1, 6.9; FC „TR“: 18_012 N 61,75 kN → 0,82, hier 61,6 kN → 0,82).
- Stiele „DIN 4420-1 Tab. 7“ in FC = Cosinus-Interaktion des Rohrs (hier „Rohr“; UVH 1224: 0,72
  gegen 0,73, UVR 1215: 0,64 gegen 0,63).
- Horizontalriegel UHV Plus als Fachwerk (Obergurt RHP 60×30×3, Untergurt RHP 40×20×3, 11 cm).
- Gitterträger ULS Flex: Endfeld 0,5 m mit Untergurt, Pfosten und Diagonale.
- Rohre als Verband: an den Stielen ihrer Kupplungen (erste und letzte entlang des Rohrs; die Enden
  dürfen über die Stiele hinausragen), ohne Kupplungen in der Zeichnung an den Stielen, an denen das
  Rohr vorbeiläuft. Ein Rohr mit Kupplungen an zwei Stielen ist kein Anker.
- Drehkupplungen SW 48/48 aus Teilen („zu_017010_01“ + „017010_02“) werden als ein Teil gelesen;
  Kreuzkopfspindel TR 38-70/50 (715608), Spindel des Spindelkopfs SRU (109952) als Kopfspindeln.

Benutzerdefinierte Lasten: Einzellast je Teil an einer Stelle der Länge (auch auf Kopfspindeln:
an ihrem Kopf) oder Streckenlast, G (in allen Kombinationen) oder Q (nur Arbeitsbetrieb).
Dynamische Horizontalbelastung DHB wie FC: 10 % der vom Kran abgesetzten Last (18_011: 10 t →
0,42 kN × 24; 18_012: 20 t → 0,5 kN × 40 Kreuzkopfspindeln), zu gleichen Teilen auf die gewählten
Teile oder oben auf die Stiele, die bis zur Oberkante reichen; Richtung ±x/±y, nur x oder nur y.

18_011 (Lasten des Berichts): ΣV 615 kN (FC 619), Verschiebung A ±x 22,6 / 23,0 mm (FC 23,7 / 24,4),
A ±y 22,0 / 21,5 (19,5 / 19,7), max Fußpunkt 55,4 kN (56,9), η Fußspindel 0,56 (0,63),
Kopfspindel 0,45 (0,44), Stoß 0,51 (0,52), Stiel 0,52 (0,52).

18_012 (Lasten des Berichts, DHB nur ±y): Eigengewicht 96,3 kN (FC 100,3), A ±y 28,9 / 28,1 mm
(30,4 / 29,2), Kopfspindel V47 0,82 (0,82), Knoten UVH 0,67 (0,73), Fußspindel 0,42 (0,48).
Offen: in x ist das Modell rund 30 % weicher (A ±x 15,6 / 10,4 mm gegen 11,5 / 8,1). Ursache sind
die Knotendiagonalen UBK: hier mit der Gesamtsteifigkeit nach Tabelle 15, in FC als Stäbe mit
eigenen Anschlussfedern (Anlage A, Tabelle A.1) – dort tragen sie wenig (η ≤ 0,14), hier bis 0,61.
Daher heben in S ±x mehr Fußpunkte ab (75 statt 50) und die Kombination bleibt zweiseitig gelagert.

**UBK nach Anlage A (Option, Standard).** Tabelle A.1 (UBK) / A.2 (UBK-2) mit dem statischen System
von Anlage A S. 20 / 21: Diagonalkopf e_x = 8,3 cm neben der Ständerachse im Feld, e_y = 3,6 cm
(UBK-2: 5,0 cm) neben der Ständerebene als starre Endexzentrizitäten des Fachwerkstabs; die Knoten-
momente gehen so in Ständer und Riegel. Alternativ Tabelle 15 (zentrisch). Für 18_012 ändert das die
Steifigkeit in x kaum (A +x 15,8 statt 15,6 mm) – der Unterschied zu FC liegt also nicht an der UBK.
Die Lose der Diagonalen ist ein Schalter: ohne (wie FC) oder nach Zulassung.

**18_013 (Absetzbühne, PFC 4.4.14).** Nur R (γ = 1,5) und S (γ_G = 0,9) mit maximalem Wind
q = 0,40 kN/m² (k(T) = 0,7 bereits eingerechnet, Standzeitfaktor in FC 1,0), keine Arbeitskombination.
Lasten: Eigengewicht, Plattform oben 36 × 1,6 kN auf die Kreuzkopfspindeln, Ballast 32 Riegel
UHV 150 × 3,44 kN/m (Σ 159,6 kN). Der Ballast steht in der Zeichnung 18_013.dxf als 14 Blöcke
„Büscher Block 150x60x60“ mit Attribut Gewicht = 1180 kg; das Programm liest ihre Körper (ACIS,
SAB im Abschnitt ACDSDATA bzw. SAT bei älteren DXF), legt sie auf die Riegel darunter (auf Belägen
zwischen zwei parallelen Riegeln nach dem Hebelgesetz) und setzt sie ständig an: Σ 162,1 kN auf alle
32 UHV wie in FC. Bohlen der separat berechneten Plattform und Unterlagen unter den Fußspindeln
werden nicht angesetzt. Ergebnisse (FC in Klammern): Windsumme 52,6 / 50,6 kN (56,3 / 53,8),
max. Fußpunkt 31,6 kN (30,7 / 33,9), UHV 0,37 (0,38; Feldquerschnitt am UHA, vorher fälschlich
Anschlussquerschnitt), UBL 0,56 (0,58–0,65), UH 200 0,64 (0,62), Fußspindel 0,39 (0,49 / 0,62).
Verformung: R ±x 36 / 47 mm (65), R ±y 36 mm (44), S ±x 118 / 127 mm (64), S ±y 51 mm (44).
Offen: in FC ist S ≈ R, obwohl dort in S 18 Fußpunkte abheben; im Modell erhöht das Abheben die
Verschiebung auf das Dreifache.

**Kalibrierung über 18_011 bis 18_013 (Stand nach Abgleich).** Aus den Gelenktabellen der drei
FC-Berichte und den Lagerreaktionen ergeben sich zwei Modellregeln, die jetzt Standard sind:

- Ständerstöße ohne Zug: alle drei Modelle haben das Stabendgelenk „Traggerüst“ (Ux nichtlinear,
  Biegung fest) – der Stoß überträgt Druck, unter Zug öffnet er (Kontaktstoß, nicht gesichert).
  Umschaltbar auf zugfeste Stöße. Optional ein Spiel des Stoßes unter Zug (`spliceSlack`).
- Abhebende Fußpunkte halten nichts mehr, auch horizontal (FC: Pz = Px = Py = 0). Vorher blieb die
  horizontale Lagerung, so dass sich die Horizontallast auf alle Fußpunkte verteilte und die
  Fußspindeln zu wenig Moment bekamen.
- Fußpunkte, die immer wieder zwischen Auflager und Abheben wechseln (Kraft ≈ 0), bleiben nach
  6 Wechseln abgehoben; damit konvergieren alle Kombinationen von 18_012.
- Rosetten: wie bisher alle als 6 mm (Rosette-2); nach Artikel (UVR/UVH 8 mm, Tabelle 6) wird
  18_011 deutlich steifer als FC (A ±x 18 statt 24 mm), FC rechnet also offenbar mit 6 mm.

Ergebnis 18_013 (FC in Klammern): R ±x 66,0 / 66,8 mm (64,9 / 65,0), R ±y 40 mm (44), abgehobene
Fußpunkte R x 2 (2), R y 6 (6), Reaktionen je Ständerreihe R +x 27 / 174 / 6 / 241 kN
(24 / 173 / 5 / 249), Anheben der luvseitigen Reihe 4,4 mm (FC uz 4,95 mm). 18_011: A ±x 21,9 /
22,3 (23,7 / 24,4), A ±y 22,0 (19,5).

Offen: in den Standsicherheitskombinationen S sind die FC-Verschiebungen nicht größer als in R bzw.
A, obwohl dort mehr Fußpunkte abheben (18_012: S und R auf 0,03 mm gleich, 18_013: 63,8 gegen
64,8 mm, 18_011: S 15,9 gegen A 23,7 mm bei größerem Wind). Im Modell kippen die Türme in S um die
leeseitige Reihe (18_013: ±x 124 / 134 mm, 18_011: 28 mm). Die Lagerreaktionen und die Zahl der
abhebenden Fußpunkte stimmen dabei überein (18_013 S x: 18 / 18, Reihen 0 / 87 / 0 / 182 gegen
0 / 82 / 0 / 189 kN). 18_012: R ±x 24,5 mm (17,4 / 17,9) mit 47 statt 32 / 34 abhebenden
Fußpunkten, R ±y 5 mm (10,3).

**Weitere Abgleichsschritte.**
- Vorkrümmung der Ständer wie FC (Lastfall „AI“, Abschnitt 1.6 der FC-Berichte): lokal L_el/250
  zwischen gehaltenen Knoten, global L_tot/500 über die Höhe einer Ständerreihe, als Ersatzlasten
  q = 8·N·e/L² in Richtung der Kombination mit N aus der Iteration (Theorie II. Ordnung). Die
  Rohrnachweise der Ständer stimmen mit den FC-Schnittgrößen exakt (UVH 18_012 LCC2: 0,723 gegen
  0,73; UVR 0,633 gegen 0,63), Unterschiede kommen also nur aus den Momenten.
- 18_012: FC-Ständerreihen V(11·j + i), i = Linie in x aufsteigend, j = Reihe in y aufsteigend;
  „+Y“ in FC entspricht −y der Zeichnung. Reaktionen je Reihe stimmen damit gut (A +x: 120 / 37 /
  29 kN gegen 121 / 37 / 29). Die maximalen Verschiebungen von FC liegen in 18_012 innerhalb langer
  Stäbe (Stab 8338 / 8572 bei 658–673 mm, Rohre bzw. Träger) – lokale Biegung, nicht die
  Knotenverschiebung des Gerüsts; sie sind mit `dh` nicht vergleichbar.
- Windlasten 18_012: Arbeitswind x 29,0 kN (28,9), y 19,8 + DHB 30 (50,6), maximaler Wind x 47,9
  (47,7), y 32,6 (34,0).

## Import completeness (every part of the drawing in the model)

The model records the fate of every part (`ScaffoldModel.audit`), shown under the analysis and in
the report: member, deck, joint (splice), weight only, included in the weight of another part
(spindle nut), load-bearing part not in the frame (`loose`), accessory without weight in the parts
database (`noWeight`), not in the model (`none`). Calibration drawings 18_007, 18_011, 18_012,
18_013: no part lost.

- **OCS of circles, polylines and nested inserts.** CIRCLE / LWPOLYLINE / nested INSERT in a block
  are given in the object coordinate system of their extrusion direction (210/220/230). Ignored
  before: the rosettes of the ULS Flex connector (124806, extrusion −z) were read at −0.125 / −0.625
  instead of +0.125 / +0.625 (bottom and top chord), toe boards lay flat, spindles of nested blocks
  pointed the wrong way.
- **ULS Flex connector rosettes.** Ledgers and horizontal diagonals ending at a rosette of a
  connector hang on the girder: a node at the rosette joined to the girder axis by the post of the
  connector (tube Ø48.3 × 3.2). 18_011: the 9 ledgers and 4 UBH of the platform at +4.38 m.
- **Universal coupling UK 70 (103737)** — splice of two SRU / RCS beams (no description in the
  drawing): the beams ending in it are joined rigidly (continuous beam). 18_012: 6 splices.
  Weight not in the parts database (not in the total).
- **Clamp rosette UEV (Klemmrosette)** on a standard: a rosette at its height.
- **Ledgers are never hinged.** Every ledger end sits with its wedge head in a rosette (standard,
  clamp rosette, connector, bracket tip, ledger receiver UHA): semi-rigid springs of the approval
  and the connection check. An end at a standard without a rosette of the drawing at that height
  is taken in a rosette there (note `ledgerNoRosette`).
- **Ledger held at one end only:** without decks on it a guardrail (cantilever, own weight only, no
  deck loads); with decks on it the connection at the other end was forgotten in the drawing —
  warning at import (`ledgerOneEndDecked`) and a wedge head in a rosette fixed in space assumed
  there for the analysis.
- **Head jack of the lower standard in a column link** (spindle pair through a platform) is part of
  the link member (its weight on it).

Check against PERI ForceControl after this change (same loads and options as the calibration;
before → after, FC in brackets; dh in mm):

| Drawing | Combination | before | after | FC |
|---|---|---|---|---|
| 18_011 | A ±x | 22.0 / 22.4 | 23.3 / 23.1 | 23.7 / 24.4 |
| 18_011 | A ±y | 21.7 / 21.7 | 22.1 / 22.1 | 19.5 / 19.7 |
| 18_011 | max base, kN / η base jack | 55.0 / 0.55 | 55.4 / 0.56 | 56.9 / 0.63 |
| 18_012 | A ±x | 15.3 / 10.5 | 12.6 / 10.5 | 11.5 / 8.1 |
| 18_012 | A ±y | 31.1 / 29.1 | 31.2 / 29.0 | 30 |
| 18_012 | R ±x | 25.0 / 22.5 | 23.3 / 18.4 | 17.4 |
| 18_013 | R ±x | 63.8 / 64.8 | 63.7 / 64.8 | 64.9 / 65.0 |
| 18_013 | R ±y | 40.3 / 39.9 | 40.2 / 39.9 | 43.6 / 43.7 |
| 18_007 | A, base reactions (mean deviation) | 15.0 % | 14.9 % | – |

18_011: the platform at +4.38 m now in the frame; 18_012: the SRU beams continuous at the UK 70
splices (stiffer in x). 18_013 and 18_007 practically unchanged (nothing was lost there).
