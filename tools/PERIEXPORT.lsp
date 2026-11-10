;;; PERIEXPORT.lsp - Balkenrechner / Geruestmodus
;;;
;;; Exportiert die PERI-CAD-Teile des aelteren Typs (PERI_AEC_DB_BAUTEIL, z. B. Spindeln UJB), die
;;; AutoCAD nicht in die DXF schreibt, in eine Textdatei neben der Zeichnung:
;;;   <Zeichnung>_peri.txt
;;; Die Datei zusammen mit der DXF in den Balkenrechner ziehen (Geruestmodus).
;;;
;;; Benutzung: APPLOAD -> diese Datei laden, dann Befehl PERIEXPORT.
;;; Die Zeichnung wird nicht veraendert.
;;;
;;; Format: erste Zeile "PERIEXPORT <tab> 1 <tab> INSUNITS=<n> ...", danach je Teil eine Zeile mit
;;; Feldern "Name=Wert", getrennt durch Tabulatoren: T (DXF-Typ), Handle, Layer, ArtNr,
;;; Bezeichnung, width, depth, height, Location, Rotation, Normal, Elevation (soweit vorhanden),
;;; Min / Max (umschliessender Quader in Weltkoordinaten).

(vl-load-com)

(defun peri:clean (s)
  (vl-string-translate "\t\r\n" "   " s)
)

(defun peri:num (x)
  (if (numberp x) (rtos x 2 8) (peri:clean (vl-princ-to-string x)))
)

(defun peri:join (lst sep / r)
  (setq r nil)
  (foreach s lst
    (setq r (if r (strcat r sep s) s))
  )
  (if r r "")
)

;;; value of a COM property as text (numbers, strings, points / vectors as "x,y,z")
(defun peri:val (v)
  (cond
    ((null v) nil)
    ((= (type v) 'VARIANT) (peri:val (vlax-variant-value v)))
    ((= (type v) 'SAFEARRAY) (peri:val (vlax-safearray->list v)))
    ((= (type v) 'LIST) (peri:join (mapcar 'peri:num v) ","))
    ((= (type v) 'STR) (peri:clean v))
    ((numberp v) (peri:num v))
    ((= (type v) 'VLA-OBJECT) nil)
    (T (peri:clean (vl-princ-to-string v)))
  )
)

;;; "Name=Wert" of one property, or "" if the object does not have it
(defun peri:prop (o p / v)
  (if (and (vlax-property-available-p o p)
           (not (vl-catch-all-error-p (setq v (vl-catch-all-apply 'vlax-get-property (list o p)))))
           (setq v (peri:val v))
      )
    (strcat "\t" p "=" v)
    ""
  )
)

(defun c:PERIEXPORT (/ fname f n ss i e o line r mn mx tp)
  (setq fname (strcat (getvar "DWGPREFIX") (vl-filename-base (getvar "DWGNAME")) "_peri.txt"))
  (setq f (open fname "w"))
  (if (null f)
    (princ (strcat "\nPERIEXPORT: Datei kann nicht geschrieben werden: " fname))
    (progn
      (write-line
        (strcat "PERIEXPORT\t1\tINSUNITS=" (itoa (getvar "INSUNITS")) "\tDWG=" (peri:clean (getvar "DWGNAME")))
        f
      )
      (setq n 0)
      (foreach tp '("PERI_AEC_DB_BAUTEIL" "PERI_AEC_DB_BAUTEIL_GRUPPE")
        (setq ss (ssget "_X" (list (cons 0 tp) (cons 410 "Model"))))
        (if ss
          (progn
            (setq i 0)
            (repeat (sslength ss)
              (setq e (ssname ss i)
                    i (1+ i)
                    o (vlax-ename->vla-object e)
                    line (strcat "T=" tp)
              )
              (foreach p '("Handle" "Layer" "ArtNr" "Bezeichnung" "width" "depth" "height" "Location" "Rotation" "Normal" "Elevation")
                (setq line (strcat line (peri:prop o p)))
              )
              (setq mn nil mx nil)
              (setq r (vl-catch-all-apply 'vla-getboundingbox (list o 'mn 'mx)))
              (if (and (not (vl-catch-all-error-p r)) mn mx)
                (setq line (strcat line "\tMin=" (peri:val mn) "\tMax=" (peri:val mx)))
              )
              (write-line line f)
              (setq n (1+ n))
            )
          )
        )
      )
      (close f)
      (princ (strcat "\nPERIEXPORT: " (itoa n) " Teile -> " fname))
    )
  )
  (princ)
)

(princ "\nPERIEXPORT geladen. Befehl: PERIEXPORT")
(princ)
