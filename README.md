# Herramienta de determinación de instrumento de compra (OS / Contrato simplificado / Contrato formal) · ITM Group

Aplicación web para el área de construcción: el solicitante registra una compra, la herramienta evalúa si corresponde **Orden de Servicio, Contrato simplificado o Contrato formal**, genera el folio, avisa a Compras por correo y conduce la solicitud hasta su cierre. El solicitante responde un solo cuestionario directo y solo ve el estatus; Compras valida el presupuesto (Finanzas no interviene). Incluye roles, dashboard (cualitativo vs. cuantitativo), parámetros editables y bitácora.

## Requisitos del servidor
- **Node.js 22.5 o superior** (descarga el instalador LTS desde nodejs.org). Nada más: la base de datos (SQLite) viene incluida en Node.
- Acceso al servidor SMTP de ITM para los correos (opcional para probar).
- Recomendado: publicarla detrás de HTTPS (lo habitual en ITM: IIS/Nginx como proxy hacia el puerto 3000).

## Instalación (resumen)
1. Descomprime la carpeta en el servidor, por ejemplo `C:\apps\itm-compras` o `/opt/itm-compras`.
2. Copia `.env.example` como `.env` y completa: `BASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SMTP_*`.
3. (Solo para enviar correos reales) abre una terminal en la carpeta y ejecuta `npm install`. Sin este paso la herramienta funciona y guarda los correos en Administración > Correos.
4. Arranca: `node --env-file=.env server/index.js` y abre `http://servidor:3000`.
5. Entra con el administrador, cambia la contraseña (menú «Mi contraseña») y crea los usuarios en Administración > Usuarios.
6. Para que arranque sola: en Windows usa NSSM o PM2 (`pm2 start server/index.js --node-args="--env-file=.env"`); en Linux, un servicio systemd.

Probar sin riesgo: `SEED_DEMO=1` crea usuarios demo (solicitante@, compras@, legal@, ti@, obra@ `itm.local`, clave `demo1234`). Se borran desde Administración > Usuarios.

## Primeros pasos recomendados
1. Administración > **Obras**: crea las obras con su prefijo de folio (ej. `CAN` → CAN-2026-0001).
2. Administración > **Parámetros**: revisa topes (14,000 / 25,000), tope absoluto para giros, dominio de correo corporativo, bandas de E1 (provisionales, tú las validas), revisión de Legal por nivel.
3. Administración > **Tipos y reglas**: giros elegibles, exclusiones de Legal, perfiles sugeridos por tipo.
4. Crea usuarios con sus roles. Un usuario puede tener varios.

## Cómo decide el instrumento
- La **matriz de ITM** (12 preguntas, 4 dimensiones, máximo por dimensión, total 0–12; cualquier dimensión en 3 = ALTO) da el nivel base: BAJO = OS, MEDIO = Contrato simplificado, ALTO = Contrato formal.
- La **regla de Legal** da el nivel mínimo: la OS es elegible si el monto evaluado ≤ 14,000, o (sin exclusiones X1–X5) si ≤ 25,000, o si el tipo es un giro elegible (material de obra, equipo usado) y no supera el tope absoluto. Si no es elegible, el mínimo es Contrato simplificado.
- **Instrumento final = el mayor de los dos.** El resultado siempre muestra qué regla lo determinó.
- Monto evaluado = monto de la solicitud + acumulado del mismo proveedor y obra en la ventana (12 meses).
- Los **disparadores** (6) se proponen automáticamente a partir de las respuestas del cuestionario; solo Compras o Legal pueden ajustarlos, con justificación. Si alguno queda en Sí, la solicitud se bloquea hasta que el área correspondiente la marque «Atendida». No cambian la clasificación.
- Ajustes manuales: Compras y Legal pueden subir el instrumento; solo Legal puede bajarlo; siempre con justificación y el resultado original queda guardado.

## Contrato simplificado: borrador automático
Para el nivel N2 la herramienta genera un **borrador** con los datos de la solicitud (proveedor, monto con letra, objeto, obra, fecha) y cláusulas condicionales según las respuestas del cuestionario. Los datos faltantes aparecen como `[POR COMPLETAR]`. Se descarga en Word o se imprime. La plantilla es editable en Administración > **Plantilla de contrato**; **debe ser validada por Legal** antes de usarse. Completa ahí la razón social y el representante legal de ITM.

## Decisiones propuestas por mí (cámbialas en Administración)
- **Tope absoluto para giros elegibles: USD 50,000** (vacío = sin tope). Evita una OS de 60,000 o más por ser «acero».
- **Exclusiones bajo el tope vigente:** mano de obra, fianzas y construcción también impiden la OS por debajo de 14,000 (Legal dice que no deben involucrarse «aunque sea 25,000»). Equipo nuevo y renta con operador solo limitan la ampliación.
- Revisión de Legal: N1 opcional (se puede solicitar), N2 por excepción, N3 siempre.

## Respaldos y seguridad
- Respalda la carpeta `data/` (base de datos `itm-compras.db` y `uploads/`). Con el servicio detenido, basta copiarla.
- Contraseñas con scrypt, bloqueo tras 5 intentos fallidos, sesiones de 12 h, bitácora que la base de datos no deja editar ni borrar.
- **Login con correo corporativo:** esta versión usa correo corporativo + contraseña administrada en la herramienta, restringido al dominio configurado. Si ITM prefiere inicio de sesión único con Microsoft 365 / Entra ID, es una extensión del módulo de acceso (`server/index.js`, rutas `/api/login`); requiere que TI registre la aplicación.
- Los PDF se generan con «Imprimir / PDF» del navegador desde el detalle de la solicitud.

## Pruebas
`npm test` ejecuta 21 pruebas: los casos A–K del motor de reglas, el flujo completo por roles, permisos y bitácora.

## Fase 2 (no incluida)
Plantillas de OS y de Contrato formal (hoy solo se genera el Contrato simplificado), evaluación de idoneidad del proveedor, integración con pagos/ERP y SSO.
