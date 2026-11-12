'use strict';
// Parametros por defecto. Todo esto se puede cambiar desde Administracion.
module.exports = {
  topeVigente: 14000,
  topeAmpliado: 25000,
  topeAbsolutoGiros: 50000,       // propuesta: tope de seguridad para giros elegibles (editable, vacio = sin tope)
  ventanaMeses: 12,
  alertaPct: 80,
  avisoInformativo: true,
  presupuestoCompras: true,         // Compras valida si hay presupuesto (Finanzas no participa por ahora)
  dominioCorreo: '',              // ej. itmgroup.com ; vacio = cualquier dominio
  bandasE1: [ { hasta: 25000, valor: 1 }, { hasta: 100000, valor: 2 }, { hasta: null, valor: 3 } ],
  exclusiones: [
    { id:'X1', texto:'Incluye mano de obra', activa:true, aplicaBajoTope:true },
    { id:'X2', texto:'Requiere fianzas', activa:true, aplicaBajoTope:true },
    { id:'X3', texto:'Es construcción o ejecución de obra', activa:true, aplicaBajoTope:true },
    { id:'X4', texto:'Es equipo o maquinaria nueva', activa:true, aplicaBajoTope:false },
    { id:'X5', texto:'Es arrendamiento de maquinaria (implica operador)', activa:true, aplicaBajoTope:false }
  ],
  tipos: [
    { id:'material_obra', nombre:'Material de obra', naturaleza:'cuantitativa', giroElegible:true,  perfil:{O1:1,O2:1,O3:1}, x:{} },
    { id:'equipo_usado',  nombre:'Equipo o maquinaria usada', naturaleza:'cuantitativa', giroElegible:true, perfil:{O1:1,O2:1,O3:1}, x:{} },
    { id:'equipo_nuevo',  nombre:'Equipo o maquinaria nueva', naturaleza:'cuantitativa', giroElegible:false, perfil:{O1:1,O2:1,O3:1}, x:{X4:'si'} },
    { id:'arrendamiento', nombre:'Arrendamiento de maquinaria', naturaleza:'cualitativa', giroElegible:false, perfil:{O1:2,O2:2,O3:2}, x:{X5:'si'} },
    { id:'subcontrato',   nombre:'Subcontrato o mano de obra', naturaleza:'cualitativa', giroElegible:false, perfil:{O1:2,O2:2,O3:2}, x:{X1:'si'} },
    { id:'servicio_prof', nombre:'Servicio profesional', naturaleza:'cualitativa', giroElegible:false, perfil:null, x:{} },
    { id:'otro',          nombre:'Otro', naturaleza:'cualitativa', giroElegible:false, perfil:null, x:{} }
  ],
  revisionLegal: { N1:'opcional', N2:'excepcion', N3:'siempre' },   // siempre | excepcion | opcional | ninguna
  autorizacion: { N1:'direccion_obra', N2:'direccion_obra', N3:'direccion_obra' },
  razonSocialITM: '[RAZÓN SOCIAL DE ITM POR CONFIRMAR]',
  representanteITM: '[REPRESENTANTE LEGAL DE ITM POR CONFIRMAR]',
  ciudadJurisdiccion: 'Cancún, Quintana Roo',
  tiposContrato: { material_obra:'COMPRAVENTA DE MATERIALES', equipo_usado:'COMPRAVENTA DE EQUIPO O MAQUINARIA USADA', equipo_nuevo:'COMPRAVENTA DE EQUIPO O MAQUINARIA', arrendamiento:'ARRENDAMIENTO DE MAQUINARIA', subcontrato:'PRESTACIÓN DE SERVICIOS', servicio_prof:'PRESTACIÓN DE SERVICIOS PROFESIONALES', otro:'SUMINISTRO Y/O PRESTACIÓN DE SERVICIOS' },
  plantillaContrato: {
    encabezado: 'CONTRATO SIMPLIFICADO DE {{tipo_contrato}}\nFolio de solicitud: {{folio}}\n\nQue celebran, por una parte, {{razon_social_itm}}, representada por {{representante_itm}}, en lo sucesivo «ITM»; y por la otra, {{proveedor}}, con RFC / ID fiscal {{rfc_proveedor}}, representada por {{representante_proveedor}}, en lo sucesivo «EL PROVEEDOR»; conforme a las siguientes declaraciones y cláusulas.',
    declaraciones: 'DECLARACIONES\n\nI. Declara ITM que requiere contratar lo descrito en la cláusula Primera para la obra «{{obra}}».\n\nII. Declara EL PROVEEDOR que tiene capacidad legal, técnica y económica para cumplir este contrato, que cuenta con las autorizaciones aplicables y que se encuentra al corriente de sus obligaciones fiscales.\n\nIII. Las partes se reconocen la personalidad con la que comparecen y manifiestan que este contrato sustituye a cualquier acuerdo previo sobre el mismo objeto.',
    clausulas: [
      { id:'objeto', titulo:'Objeto', cuando:'siempre', texto:'EL PROVEEDOR se obliga con ITM a proporcionar lo siguiente: {{descripcion}}. Cantidad: {{cantidad}} {{unidad}}. Lugar y condiciones de entrega o ejecución: {{lugar_entrega}}.' },
      { id:'precio', titulo:'Precio y forma de pago', cuando:'siempre', texto:'El precio total es de USD {{monto}} ({{monto_letra}}), más los impuestos que correspondan. Forma de pago: {{forma_pago}}. El pago se hará contra entrega o aceptación a satisfacción de ITM y recepción de la factura que cumpla los requisitos fiscales.' },
      { id:'vigencia', titulo:'Vigencia y plazo', cuando:'siempre', texto:'Este contrato tiene vigencia del {{vigencia_inicio}} al {{vigencia_fin}}. La fecha requerida de entrega es {{fecha_requerida}}.' },
      { id:'calidad', titulo:'Calidad, aceptación y garantía', cuando:'siempre', texto:'EL PROVEEDOR responderá por la calidad, cantidad y conformidad con lo ofrecido en su cotización de referencia. ITM podrá rechazar lo que no cumpla y EL PROVEEDOR lo corregirá o repondrá a su costa en un plazo razonable. Garantía: {{garantia}}.' },
      { id:'anticipos', titulo:'Anticipos y garantías de pago', cuando:'G6', texto:'Los anticipos, depósitos o pagos no reembolsables que las partes hayan pactado serán únicamente los indicados en esta cláusula: {{detalle_anticipos}}. EL PROVEEDOR garantizará la devolución del anticipo en caso de incumplimiento.' },
      { id:'penas', titulo:'Penas convencionales, variaciones y cancelación', cuando:'G7', texto:'Las penalizaciones, ajustes de precio, renovaciones y costos de cancelación aplicables son: {{detalle_penalizaciones}}. Fuera de lo aquí pactado no habrá cargos adicionales.' },
      { id:'confidencialidad', titulo:'Confidencialidad y protección de datos', cuando:'G1', texto:'EL PROVEEDOR guardará estricta confidencialidad sobre la información de ITM a la que tenga acceso, la usará solo para cumplir este contrato, aplicará medidas de seguridad razonables, no la transferirá a terceros y la devolverá o eliminará al terminar. En el caso de datos personales cumplirá la legislación aplicable. Accesos y sistemas: {{detalle_accesos}}.' },
      { id:'tecnologia', titulo:'Software, integraciones y servicios tecnológicos', cuando:'G2', texto:'Para el desarrollo, integración, hosting o soporte, las partes definirán por escrito el alcance, los entregables, la titularidad, las licencias, los repositorios y los criterios de aceptación. EL PROVEEDOR no hará cambios a los sistemas de ITM sin autorización de TI.' },
      { id:'personal', titulo:'Personal en instalaciones y seguridad', cuando:'G3', texto:'El personal de EL PROVEEDOR actuará bajo su exclusiva dirección y responsabilidad; EL PROVEEDOR es el único patrón de su personal y sacará a ITM en paz y a salvo de cualquier reclamación laboral, de seguridad social o de seguridad e higiene. En las instalaciones de ITM cumplirá las políticas de acceso y seguridad de la obra.' },
      { id:'regulatorio', titulo:'Permisos, licencias y cumplimiento regulatorio', cuando:'G4', texto:'EL PROVEEDOR cuenta y mantendrá vigentes los permisos, licencias y certificaciones requeridos para su actividad, y los exhibirá a ITM cuando lo solicite.' },
      { id:'pi', titulo:'Exclusividad, propiedad intelectual y compromisos especiales', cuando:'G5', texto:'Las condiciones de exclusividad, propiedad intelectual, uso de marca, indemnizaciones, garantías y compromisos de largo plazo son las siguientes: {{detalle_condiciones_especiales}}. Ninguna otra se entenderá pactada.' },
      { id:'rescision', titulo:'Terminación y rescisión', cuando:'siempre', texto:'Cualquiera de las partes podrá rescindir este contrato por incumplimiento de la otra, previo aviso por escrito con diez días naturales para subsanar. ITM podrá darlo por terminado anticipadamente con aviso por escrito, pagando lo efectivamente entregado o ejecutado.' },
      { id:'ley', titulo:'Ley aplicable y jurisdicción', cuando:'siempre', texto:'Para la interpretación y cumplimiento de este contrato las partes se someten a las leyes aplicables y a los tribunales de {{ciudad_jurisdiccion}}, renunciando a cualquier otro fuero que pudiera corresponderles.' }
    ],
    cierre: 'Leído que fue este contrato y enterados de su alcance, las partes lo firman en {{ciudad_jurisdiccion}}, a {{fecha}}.\n\n\nPOR ITM\n{{representante_itm}}\n\n\nPOR EL PROVEEDOR\n{{representante_proveedor}}'
  },
  textos: {
    PENDIENTE: 'Completar las 12 respuestas',
    BLOQUEADA: 'NO HABILITAR: cerrar revisión especializada',
    N1: 'Orden de Servicio (OS), sujeta a las reglas y autorizaciones vigentes de ITM',
    N2: 'Contrato simplificado (convenio marco o cláusulas específicas), según determine Legal',
    N3: 'Contrato formal y controles especializados definidos por Legal y las áreas competentes'
  },
  preguntas: {
    E1:['Económica','Cuál es el compromiso económico total estimado durante toda la vigencia de la relación? (automática por bandas)',['Sin compromiso o impacto económico identificable.','Compromiso bajo frente al presupuesto y capacidad de la UDN.','Compromiso material que requiere seguimiento financiero.','Compromiso elevado frente al presupuesto/capacidad o con impacto financiero relevante.']],
    E2:['Económica','La relación contempla anticipos, depósitos, pagos no reembolsables, garantías o consumos mínimos?',['No contempla anticipos, garantías ni mínimos.','Condiciones estándar, acotadas y recuperables.','Anticipos/garantías o mínimos relevantes con exposición controlable.','Anticipos no recuperables, garantías relevantes o exposición financiera significativa.']],
    E3:['Económica','Existen condiciones que puedan generar compromisos economicos adicionales (penalizaciones, variaciones, renovaciones, cancelaciones)?',['No existen compromisos adicionales relevantes.','Ajustes limitados y previamente definidos.','Variaciones, renovaciones o penalizaciones con impacto potencial relevante.','Compromisos abiertos, penalizaciones importantes o costos difíciles de limitar.']],
    O1:['Operativa','Qué tan crítico es el servicio o producto del proveedor para la continuidad de las operaciones de ITM?',['No es crítico; su interrupción no afecta procesos relevantes.','Apoya una actividad secundaria con alternativas disponibles.','Soporta un proceso importante o una UDN con impacto operativo significativo.','Es indispensable para una operación crítica o para mantener el servicio al cliente.']],
    O2:['Operativa','Qué impacto tendría la interrupción o incumplimiento del proveedor en la operación, ingresos o experiencia del cliente?',['Impacto prácticamente nulo y fácilmente absorbible.','Impacto localizado y temporal, sin afectación relevante al cliente.','Afectacion relevante a servicio, ingresos, capacidad o experiencia del cliente.','Interrupcion severa, afectación amplia al cliente, ingresos, seguridad o continuidad.']],
    O3:['Operativa','Qué tan viable sería sustituir al proveedor por otra alternativa sin afectar la operación?',['Sustitucion inmediata y múltiples alternativas equivalentes.','Alternativas disponibles con transición sencilla.','Alternativas limitadas o transición que requiere tiempo/recursos.','Proveedor unico, alta dependencia o sustitución compleja/prolongada.']],
    J1:['Jurídica y regulatoria','El servicio requiere permisos, licencias, certificaciones o cumplimiento de regulaciones específicas?',['No se identifican requisitos especiales.','Requisitos estándar y de bajo impacto, fácilmente verificables.','Permisos/certificaciones específicos u obligaciones relevantes.','Actividad fuertemente regulada o cuyo incumplimiento puede generar sanciones relevantes.']],
    J2:['Jurídica y regulatoria','El proveedor incorporará personal en instalaciones de ITM o participará directamente en actividades bajo coordinación operativa de la organización?',['No incorpora personal ni participa en actividades operativas de ITM.','Acceso ocasional y acotado, sin integración a la operación.','Personal recurrente en sitio o interaccion frecuente con equipos de ITM.','Participacion continua en actividades operativas o coordinación estrecha que exige revisión de responsabilidades.']],
    J3:['Jurídica y regulatoria','La relación implica condiciones especiales como exclusividad, propiedad intelectual, uso de marca, indemnizaciones, garantías o compromisos de largo plazo?',['No; condiciones comerciales estándar.','Clausulas estándar, limitadas y preaprobadas.','Obligaciones especiales o derechos que requieren negociación/revisión.','Exclusividad, transferencia/licencia de propiedad intelectual critica, indemnidades amplias o compromisos difíciles de terminar.']],
    T1:['Tecnológica y de información','El proveedor requerira acceso a sistemas, aplicaciones, redes, infraestructura o credenciales de ITM?',['No requiere acceso a activos tecnológicos de ITM.','Acceso limitado, temporal o a entornos no críticos.','Cuenta nominativa con acceso a sistemas o información interna relevante.','Acceso privilegiado/administrativo, remoto o a infraestructura/sistemas críticos.']],
    T2:['Tecnológica y de información','El proveedor tendrá acceso, recibirá, almacenará o procesará información personal, financiera, confidencial o estratégica de ITM?',['No accede ni procesa información de ITM.','Solo información pública o interna de baja sensibilidad.','Informacion confidencial, financiera o comercial relevante, de alcance limitado.','Datos personales/sensibles, credenciales o volumenes amplios de información critica.']],
    T3:['Tecnológica y de información','La relación contempla desarrollo de software, integraciones, alojamiento de información, soporte remoto o administración de sistemas?',['No contempla actividades tecnológicas ni tratamiento de información.','Soporte puntual sin acceso relevante ni cambios a sistemas.','Desarrollo/integración/hosting acotado o soporte con acceso controlado.','Administracion u operación continua de sistemas, hosting crítico o control de codigo/infraestructura.']]
  },
  gates: {
    G1:'El proveedor tendrá acceso a sistemas, redes, credenciales o a información personal, financiera, confidencial o estratégica de ITM?',
    G2:'Incluye desarrollo de software, integraciones, hosting, soporte remoto o administración de sistemas?',
    G3:'Habrá personal del proveedor en instalaciones de ITM o participando en actividades bajo coordinación operativa de ITM?',
    G4:'Se requieren permisos, licencias, certificaciones o cumplimiento regulatorio específico?',
    G5:'Hay exclusividad, propiedad intelectual, uso de marca, indemnizaciones, garantías o compromisos de largo plazo?',
    G6:'Hay anticipos, depósitos, pagos no reembolsables, garantías o consumos mínimos?',
    G7:'Puede haber penalizaciones, variaciones de precio, renovaciones o cancelaciones con costo?'
  },
  disparadores: [
    { id:1, nombre:'Acceso a información personal o confidencial', areas:['legal','ti'], evidencia:'Tipo de datos, finalidad, volumen, almacenamiento, conservación y eliminación', regla:'No avanzar hasta completar la revisión y los controles aplicables.' },
    { id:2, nombre:'Acceso a infraestructura o sistemas de ITM', areas:['ti'], evidencia:'Sistema, tipo de acceso, privilegios, duración y controles', regla:'No otorgar accesos antes de la autorización técnica.' },
    { id:3, nombre:'Desarrollo de software o propiedad intelectual', areas:['legal','ti'], evidencia:'Alcance, entregables, titularidad, licencias, repositorios y aceptación', regla:'Definir derechos, seguridad y entregables antes de iniciar.' },
    { id:4, nombre:'Servicio crítico para la continuidad operativa', areas:['legal'], evidencia:'Impacto, continuidad, SLA, contingencia y sustitución', regla:'Definir continuidad, niveles de servicio y plan de salida.' },
    { id:5, nombre:'Obligaciones regulatorias o responsabilidades especiales', areas:['legal'], evidencia:'Permisos, licencias, certificaciones y obligaciones aplicables', regla:'Validar cumplimiento antes de habilitar.' },
    { id:6, nombre:'Anticipos, garantías o penalizaciones relevantes', areas:['legal'], evidencia:'Importes, calendario, garantías, penalizaciones y condiciones de recuperacion', regla:'Validar exposición y autorizaciones financieras.' }
  ]
};
