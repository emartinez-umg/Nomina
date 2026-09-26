#!/bin/bash
# Instalación local del ERP completo con datos ficticios de demostración.
set -euo pipefail
export NLS_LANG=AMERICAN_AMERICA.AL32UTF8
marker=/opt/oracle/oradata/.nomina-initialized
[[ -f "$marker" ]] && exit 0
[[ "${NOM_DB_USER:-}" =~ ^[A-Z][A-Z0-9_]{0,29}$ ]] || { echo 'NOM_DB_USER debe ser un identificador Oracle en mayúsculas.' >&2; exit 1; }
[[ "${NOM_DB_PASSWORD:-}" =~ ^[A-Za-z][A-Za-z0-9_#]{11,63}$ ]] || { echo 'NOM_DB_PASSWORD: 12-64 caracteres; letra inicial y solo letras, números, _ o #.' >&2; exit 1; }
# Do not print generated SQL: it includes a development password.
sqlplus -s / as sysdba <<SQL
WHENEVER OSERROR EXIT FAILURE
WHENEVER SQLERROR EXIT SQL.SQLCODE
SET ECHO OFF VERIFY OFF FEEDBACK OFF
ALTER SESSION SET CONTAINER = XEPDB1;
CREATE USER ${NOM_DB_USER} IDENTIFIED BY "${NOM_DB_PASSWORD}" DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS;
GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW TO ${NOM_DB_USER};
ALTER SESSION SET CURRENT_SCHEMA = ${NOM_DB_USER};
@/opt/nomina/init.sql
EXIT SUCCESS
SQL
touch "$marker"
echo 'ERP: 194 tablas inicializadas, incluidas 35 tablas de Nómina.'
