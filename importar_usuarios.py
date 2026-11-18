#!/usr/bin/env python3
"""
importar_usuarios.py — SIGESPER-FFAA
Crea usuarios en Firebase Auth + Firestore con primer_acceso=True.

Requisitos:
  pip install firebase-admin

Uso:
  python importar_usuarios.py serviceAccountKey.json
"""

import sys
import json

try:
    import firebase_admin
    from firebase_admin import credentials, auth, firestore
except ImportError:
    print("ERROR: Instala firebase-admin primero:")
    print("  pip install firebase-admin")
    sys.exit(1)

# ── USUARIOS ──────────────────────────────────────────────────────────────────

CONTRASENA_TEMPORAL = "Minisdef2026."

USUARIOS = [
    {
        "email":          "anavhoy@ea.mde.es",
        "nombre_completo":"NAVARRO HOYO, Álvaro",
        "dni":            "77339002F",
        "empleo":         "Sargento 1º",
        "rol":            "jefe_seccion",
        "seccion":        "CIS",
    },
    {
        "email":          "ftobfer@ea.mde.es",
        "nombre_completo":"TOBOSO FERNÁNDEZ, Fernando",
        "dni":            "44387882K",
        "empleo":         "Cabo 1º",
        "rol":            "empleado",
        "seccion":        "CIS",
    },
    {
        "email":          "jmotmon@mde.es",
        "nombre_completo":"MOTILLA MONTEAGUDO, Jaime",
        "dni":            "74524830T",
        "empleo":         "Soldado",
        "rol":            "empleado",
        "seccion":        "SECFAS",
    },
    {
        "email":          "pjunfe1@mde.es",
        "nombre_completo":"JUNCO FERNÁNDEZ, Pablo",
        "dni":            "74742615K",
        "empleo":         "Sargento",
        "rol":            "empleado",
        "seccion":        "GEL",
    },
    {
        "email":          "fmarbe1@mde.es",
        "nombre_completo":"MARTÍNEZ BERNAL, Francisco Javier",
        "dni":            "49479015N",
        "empleo":         "Teniente",
        "rol":            "jefe_seccion",
        "seccion":        "Piloto",
    },
    {
        "email":          "pruebatcol@mde.es",
        "nombre_completo":"PRUEBA TCOL, Rafael",
        "dni":            "00000000A",
        "empleo":         "Teniente Coronel",
        "rol":            "jefe_grupo",
        "seccion":        "JEFE FAS",
    },
    {
        "email":          "fnavcas@mde.es",
        "nombre_completo":"NAVARRO CASAS, Francisco José",
        "dni":            "47449278W",
        "empleo":         "Sargento 1º",
        "rol":            "empleado",
        "seccion":        "INTEL",
    },
]

# ── MAIN ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Uso: python importar_usuarios.py serviceAccountKey.json")
        sys.exit(1)

    key_path = sys.argv[1]
    print(f"Usando clave de servicio: {key_path}\n")

    cred = credentials.Certificate(key_path)
    firebase_admin.initialize_app(cred)
    db = firestore.client()

    ok = 0
    errores = []

    for u in USUARIOS:
        email = u["email"].strip()
        print(f"  → {email} ... ", end="", flush=True)
        try:
            # 1. Crear en Firebase Auth
            try:
                user_record = auth.create_user(
                    email=email,
                    password=CONTRASENA_TEMPORAL,
                    display_name=u["nombre_completo"],
                    email_verified=False,
                )
                uid = user_record.uid
                print(f"Auth OK (uid={uid[:8]}…) ", end="", flush=True)
            except auth.EmailAlreadyExistsError:
                # Ya existe en Auth → obtenemos el UID existente
                user_record = auth.get_user_by_email(email)
                uid = user_record.uid
                print(f"Auth ya existía (uid={uid[:8]}…) ", end="", flush=True)

            # 2. Crear/actualizar perfil en Firestore
            perfil = {
                "email":          email,
                "nombre_completo": u["nombre_completo"],
                "dni":            u["dni"],
                "empleo":         u["empleo"],
                "rol":            u["rol"],
                "seccion":        u.get("seccion", ""),
                "primer_acceso":  True,
            }
            db.collection("user_profiles").document(uid).set(perfil, merge=True)
            print("Firestore OK ✓")
            ok += 1

        except Exception as e:
            msg = str(e)
            print(f"ERROR: {msg}")
            errores.append((email, msg))

    print(f"\n{'='*55}")
    print(f"Resultado: {ok}/{len(USUARIOS)} usuarios creados correctamente.")
    if errores:
        print("\nErrores:")
        for email, msg in errores:
            print(f"  ✗ {email}: {msg}")
    else:
        print("Sin errores.")

if __name__ == "__main__":
    main()
