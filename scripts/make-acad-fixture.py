"""Synthetic AutoCAD beam export (same layout as the real export) for the import tests."""
import io, sys
import openpyxl
from openpyxl.drawing.image import Image
from PIL import Image as PILImage

wb = openpyxl.Workbook()
o = wb.active
o.title = 'Übersicht'
o.append(['Balken', 'Handle', 'Artikel', 'Bezeichnung', 'Länge [mm]', 'Höhe UK [mm]', 'Höhe OK [mm]', 'Mitte X [mm]', 'Mitte Y [mm]',
          'Gewicht [kg]', 'Auflager', 'Lasten', 'Σ Lasten Fk [kN]', 'max. Last Fk [kN]', 'Auflage'])
o.append(['B-001', 'A1', '109471', 'RCS 498', 4980, 1000, 1200, 0, 0, 262, 3, 3, 0, 0, 'Gelenklager (Ständer)'])
o.append(['B-002', 'A2', '103874', 'SRU 122', 1222, 1000, 1240, 0, 0, 30.9, 0, 2, 0, 0, 'durchgehend (Untergrund)'])
o.append(['B-003', 'A3', '103877', 'SRU 147', 1472, 1000, 1240, 0, 0, 38.1, 1, 2, 0, 0, 'Gelenklager (Ständer)'])
o.append(['B-004', 'A4', '111390', 'Kletterschienenverbinder RCS 97', 965, 0, 0, 0, 0, 32.8, 0, 0, 0, 0, 'durchgehend (Untergrund)'])
o.append(['B-005', 'A5', '103906', 'SRU 347', 3460, 0, 0, 0, 0, 92.6, 2, 1, 0, 0, 'Gelenklager (Ständer)'])
o.append(['B-006', 'A6', '109469', 'RCS 248', 232, 0, 0, 0, 0, 130, 0, 1, 0, 0, 'durchgehend (Untergrund)'])
p = wb.create_sheet('Positionen')
p.append(['Balken', 'Handle', 'Art', 'Name', 'Position vom linken Rand [mm]', 'Abstand zum vorherigen [mm]', 'Gk [kN]', 'Qk [kN]', 'Fk [kN]', 'Fd [kN]', 'Fläche [m²]', 'Herkunft'])
rows = [
    ('B-001', 'Auflager (Gelenklager)', 'S1', 929, None, None),
    ('B-001', 'Last', 'A', 929, 11.86, 5.40),
    ('B-001', 'Last', 'B', 2428, 0.07, 0),
    ('B-001', 'Auflager (Gelenklager)', 'S2', 2428, None, None),
    ('B-001', 'Last', 'C', 3430, 15.0, 7.9),
    ('B-001', 'Auflager (Gelenklager)', 'S3', 4928, None, None),
    ('B-002', 'Last', 'A', 300, 2.0, 1.0),
    ('B-002', 'Last', 'B', 900, 3.0, 0),
    ('B-003', 'Last', 'A', 298, 0.3, 0),
    ('B-003', 'Auflager (Gelenklager)', 'S1', 298, None, None),
    ('B-003', 'Last', 'B', 1299, 13.4, 6.3),
    ('B-005', 'Auflager (Gelenklager)', 'S1', 100, None, None),
    ('B-005', 'Last', 'A', 1700, 5, 2),
    ('B-005', 'Auflager (Gelenklager)', 'S2', 3400, None, None),
    ('B-006', 'Last', 'A', 116, 7.1, 2.5),
]
for b, art, name, x, g, q in rows:
    fk = None if g is None else g + q
    fd = None if g is None else 1.35 * g + 1.5 * q
    p.append([b, 'h', art, name, x, 0, g, q, fk, fd, 0, ''])
a = wb.create_sheet('Abbildungen')
a.append(['Balken', 'Abbildung'])
for i, (key, des) in enumerate([('B-001', 'RCS 498'), ('B-002', 'SRU 122'), ('B-003', 'SRU 147')]):
    a.append([f'{key}\n{des}'])
    buf = io.BytesIO()
    PILImage.new('RGB', (40, 20), (i * 80, 120, 200)).save(buf, 'PNG')
    buf.seek(0)
    img = Image(buf)
    a.add_image(img, f'B{i + 2}')
wb.save(sys.argv[1])
