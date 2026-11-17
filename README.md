# Instrumentos de Compra · ITM Group

MVP para registrar, evaluar y dar seguimiento a las compras del área de Construcción. El paquete contiene el servidor Node.js y la interfaz en español. La demo privada permite recorrer el flujo con datos ficticios y guarda los cambios en el navegador.

## Cambios de la versión 2 (17 nov 2026)

- La demo muestra los tres perfiles del proceso: **Solicitante, Compras y Legal** (`demoParams` en `dist/demo.js`; los demás roles siguen disponibles en el servidor).
- Formulario con ayudas bajo cada fecha, proveedor registrado o nuevo (razón social y RFC / ID fiscal), preguntas sin numeración y evaluación de riesgo por 4 bloques. Los 6 disparadores de revisión ya no se preguntan: se derivan de las respuestas (`deriveTriggers`).
- El solicitante solo ve el resultado (instrumento y riesgo). Puntaje, evidencia y anexo de evaluación son para Compras.
- Compras ve y clasifica todo (Orden de Servicio, Contrato Marco, Contrato formal). Legal ve todo y solo modifica lo que requiere contrato.
- Solicitudes de información: Compras → Solicitante y Legal → Compras.
- Seguimiento visual por etapas para todos los perfiles.
- Formato de análisis imprimible. Sin él Compras no registra la requisición (`requireFormat`).

## Probar la demo

1. En **Dashboard**, selecciona **Nueva solicitud** y **Cargar ejemplo de varilla**.
2. Pulsa **Continuar** en cada paso. En una demo sin compras previas para ese proveedor y obra, el resultado es Orden de Servicio, riesgo bajo y 2 de 12 puntos.
3. Pulsa **Enviar a Compras**. Aparecerán el folio, la evaluación, los documentos, las revisiones y el seguimiento.
4. Elige **Compras** en el selector de perfil para confirmar el instrumento. Cambia a **Finanzas**, abre la revisión presupuestal y marca **Atendida** con evidencia.
5. Vuelve a **Compras**, envía el folio a autorización y cambia a **Dirección de Obra** para registrar una decisión. Registra requisición, orden y pago desde **Compras**. La recepción la confirma el perfil que creó el folio. El selector **Administrador** también dispone del rol Solicitante para esta prueba.
6. Para probar un bloqueo, abre el folio demo **Material de obra con anticipo** e intenta avanzar. Legal y Finanzas deben atender sus tareas especializadas.

## Ejecutar en una computadora

1. Descarga y extrae el archivo ZIP. Instala Node.js 24 o posterior desde [nodejs.org](https://nodejs.org/).
2. Abre la carpeta extraída. En Windows, haz clic derecho en un espacio libre y elige **Abrir en Terminal**. En macOS o Linux, abre una terminal en esa carpeta.
3. Crea una copia de `.env.example` llamada `.env`. En Windows activa **Mostrar extensiones de nombre de archivo** para comprobar que el nombre sea `.env`.
4. Abre `.env` con un editor de texto. Escribe un correo válido en `ITM_ADMIN_EMAIL` y una contraseña propia de al menos 12 caracteres en `ITM_ADMIN_PASSWORD`. Guarda el archivo.
5. Ejecuta `npm install` y después `npm start`. Cada comando se escribe en su propia línea y se ejecuta con Enter. La instalación de Nodemailer es necesaria para los avisos SMTP.
6. Abre [http://localhost:3000](http://localhost:3000/) e ingresa con el correo y la contraseña que configuraste. Mantén abierta la terminal mientras uses la aplicación.
7. En **Administración**, crea una cuenta por usuario y asígnale los roles que necesite. La contraseña de arranque se usa al crear la base por primera vez. Cuando ya exista la cuenta inicial puedes retirar esa contraseña del archivo de entorno.

## Instalar en hosting Node.js

Sube los archivos fuente a un servicio que admita Node.js 24, directorio persistente y HTTPS. Configura `server.js` como archivo de inicio o `npm start` como comando de arranque, según el panel del proveedor. Conserva `dist/` dentro del proyecto. Configura las variables desde el panel de hosting y apunta `ITM_DB` a una ruta persistente con permisos de escritura. Establece `ITM_PUBLIC_URL` con la URL HTTPS del sitio y prueba acceso, envío y permisos con cuentas de prueba antes de cargar datos reales. Este paquete se debe servir desde la raíz del dominio o subdominio.

| Variable | Uso |
| --- | --- |
| `PORT` | Puerto que asigna el hosting. Localmente, 3000 por defecto. |
| `ITM_DB` | Ruta del archivo SQLite. Por defecto, `data/itm.sqlite`. |
| `ITM_ADMIN_EMAIL`, `ITM_ADMIN_PASSWORD`, `ITM_ADMIN_NAME` | Cuenta de arranque y nombre mostrado. |
| `ITM_SEED_DEMO` | Usa 1 para cargar ejemplos ficticios al crear una base nueva. El valor para operación es 0. |
| `ITM_PUBLIC_URL`, `ITM_SECURE_COOKIE` | URL canónica y activación explícita de cookies HTTPS. Con URL HTTPS, el servidor activa automáticamente la cookie segura. |
| `ITM_COMPRAS_EMAIL`, `ITM_LEGAL_EMAIL`, `ITM_FINANZAS_EMAIL`, `ITM_TI_EMAIL`, `ITM_DIRECCION_EMAIL` | Buzones de notificaciones. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Servidor SMTP, puerto (587 por defecto) y TLS implícito (1 para el puerto 465 si así lo indica el proveedor). |
| `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Credenciales SMTP y remitente autorizado. |

### Respaldo

Detén la aplicación y copia el archivo de base de datos y los archivos SQLite auxiliares `-wal` y `-shm` si existen. Los adjuntos, la cola y la bitácora están dentro de la base. Resguarda las variables de entorno por un canal seguro. Para restaurar, detén el servicio, restaura los archivos de la misma copia a la ruta configurada y arranca. Verifica la restauración en una instancia de prueba.

## Guía por rol

| Rol | Acciones principales |
| --- | --- |
| Solicitante | Crear borrador, responder filtros y evaluación, enviar, consultar folios propios y confirmar recepción. |
| Compras | Confirmar o elevar instrumento, dar de alta proveedor, turnar a Dirección y registrar requisición, orden y pago. |
| Legal | Atender revisiones y ajustar el instrumento con justificación. |
| Finanzas | Atender revisiones económicas y validar presupuesto. |
| TI y Seguridad | Documentar controles de accesos, datos o software en las tareas asignadas. |
| Dirección de Obra | Atender la revisión operativa cuando aplique y registrar la decisión de autorización. |
| Administrador | Configurar reglas, crear usuarios, consultar dashboard y exportar bitácora. |

## Etapas y comprobación

| Etapa | Entregado | Cómo probar |
| --- | --- | --- |
| 1. Base y administración | Inicio de sesión en Node, permisos de servidor, parámetros versionados y catálogos. | Ingresa con la cuenta inicial, crea usuarios y guarda una nueva versión de parámetros. |
| 2. Solicitud y evaluación | Asistente, evidencia, matriz, exclusiones, acumulado y recomendación. | Ejecuta `npm test` o carga el ejemplo de varilla. |
| 3. Folio y avisos | Folio transaccional, impresión/PDF del navegador y cola SMTP con reintentos. | Envía una solicitud y usa **Imprimir / PDF**. En una instalación con SMTP, comprueba la entrega en un buzón de prueba. |
| 4. Flujo | Proveedores, confirmación de instrumento, revisiones, presupuesto, autorización y seguimiento. | Completa el recorrido de prueba por perfiles. |
| 5. Dashboard | Indicadores, filtros, distribución por instrumento, naturaleza y riesgo, alertas y exportación CSV. | Filtra por obra o instrumento y compara la tabla exportada. |
| 6. Auditoría | Eventos de solo anexado en SQLite, consulta y exportación CSV. | Registra una acción y verifica autor, fecha y valores en la exportación. |

### Supuestos iniciales por confirmar

- Ventana de acumulado de 12 meses y alerta al superar 80 % del tope ampliado.
- Bandas económicas provisionales de USD 25,000 y USD 100,000. El tramo siguiente inicia al superar el límite anterior, incluidos importes con centavos.
- Topes de USD 14,000 y USD 25,000, tope absoluto para giros elegibles vacío y exclusiones por debajo del tope vigente desactivadas.
- Perfiles operativos 1/1/1 para material y equipos, 2/2/2 para arrendamiento y subcontrato. Servicio profesional y Otro quedan sin perfil sugerido. Otro se inicializa como cualitativo.
- Legal por excepción en N1 y N2, siempre en N3. Dirección de Obra autoriza todos los niveles. Finanzas valida presupuesto en todas las solicitudes.
- El caso G de aceptación se completó con T1=1 (acceso temporal limitado) y T2=3 porque G1 abre ambas preguntas y un Sí exige puntuar de 1 a 3 en las dos. El resultado es ALTO y N3.
- Los disparadores de Privacidad, Compliance y revisión operativa se enrutan a los roles disponibles del MVP. La distribución precisa por obra o área queda por parametrizar.

### Estado antes de producción

Las pruebas automáticas cubren los casos A–K y el flujo de autorización y cierre. El despliegue del servidor de ITM y la entrega SMTP requieren hosting y credenciales configurados. Quedan pendientes la recuperación por correo, las aclaraciones y reevaluaciones versionadas, la corrección manual de puntuaciones y la autorización parametrizable por monto, el PDF generado en servidor como adjunto de correo, los documentos de alta de proveedores, las plantillas editables de correo y métricas avanzadas de tendencias y tiempos. El rendimiento con 10,000 solicitudes y una auditoría integral de accesibilidad y seguridad siguen por validar.

## Ajustes de la versión 2.1 (17 nov 2026)
- «Contrato básico» se llama ahora **Contrato Marco**.
- **Compras** imprime el formato de análisis, registra requisición, orden, pago y recepción, y **cierra el folio**. El solicitante solo consulta.
- **Compras** edita topes, bandas de E1, ventana de acumulado y porcentaje de alerta (valores en propuesta). Cada cambio crea un **aviso para Legal** (pantalla de Legal; correo si `ITM_LEGAL_EMAIL` está configurado) que Legal marca como leído.
- Servidor: se habilitaron las acciones `format`, `ack`, `ask`, `answer`, `legalReview` y `notice`, se guardan los avisos (tabla `notices`) y el alta automática de proveedor nuevo. Los correos por solicitud de información siguen pendientes.

## Ajustes de la versión 2.2 (17 nov 2026)
- El flujo del sistema termina en **Análisis concluido**. Se quitaron requisición, orden de compra, pago y recepción: eso se lleva en el sistema de adquisiciones.
- Compras: «Confirmar instrumento» → «Imprimir formato de análisis» (obligatorio) → «Concluir análisis».
- Legal: «Marcar contrato listo» deja su parte terminada (filtro «Mi parte terminada»).
- Cada folio muestra «Qué te toca en este folio» con los pasos del área.
- Guía de primer uso por perfil y botón «Cómo usar».
