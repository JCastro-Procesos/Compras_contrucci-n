export const defaults = {
  "questions": {
    "E1": [
      "¿Cuál es el compromiso económico total estimado durante toda la vigencia de la relación? (AUTOMÁTICA por bandas.)",
      "Sin compromiso o impacto económico identificable.",
      "Compromiso bajo frente al presupuesto y capacidad de la UDN.",
      "Compromiso material que requiere seguimiento financiero.",
      "Compromiso elevado frente al presupuesto/capacidad o con impacto financiero relevante."
    ],
    "E2": [
      "¿La relación contempla anticipos, depósitos, pagos no reembolsables, garantías o consumos mínimos?",
      "No contempla anticipos, garantías ni mínimos.",
      "Condiciones estándar, acotadas y recuperables.",
      "Anticipos/garantías o mínimos relevantes con exposición controlable.",
      "Anticipos no recuperables, garantías relevantes o exposición financiera significativa."
    ],
    "E3": [
      "¿Existen condiciones que puedan generar compromisos económicos adicionales (penalizaciones, variaciones, renovaciones, cancelaciones)?",
      "No existen compromisos adicionales relevantes.",
      "Ajustes limitados y previamente definidos.",
      "Variaciones, renovaciones o penalizaciones con impacto potencial relevante.",
      "Compromisos abiertos, penalizaciones importantes o costos difíciles de limitar."
    ],
    "O1": [
      "¿Qué tan crítico es el servicio o producto del proveedor para la continuidad de las operaciones de ITM?",
      "No es crítico; su interrupción no afecta procesos relevantes.",
      "Apoya una actividad secundaria con alternativas disponibles.",
      "Soporta un proceso importante o una UDN con impacto operativo significativo.",
      "Es indispensable para una operación crítica o para mantener el servicio al cliente."
    ],
    "O2": [
      "¿Qué impacto tendría la interrupción o incumplimiento del proveedor en la operación, ingresos o experiencia del cliente?",
      "Impacto prácticamente nulo y fácilmente absorbible.",
      "Impacto localizado y temporal, sin afectación relevante al cliente.",
      "Afectación relevante a servicio, ingresos, capacidad o experiencia del cliente.",
      "Interrupción severa, afectación amplia al cliente, ingresos, seguridad o continuidad."
    ],
    "O3": [
      "¿Qué tan viable sería sustituir al proveedor por otra alternativa sin afectar la operación?",
      "Sustitución inmediata y múltiples alternativas equivalentes.",
      "Alternativas disponibles con transición sencilla.",
      "Alternativas limitadas o transición que requiere tiempo/recursos.",
      "Proveedor único, alta dependencia o sustitución compleja/prolongada."
    ],
    "J1": [
      "¿El servicio requiere permisos, licencias, certificaciones o cumplimiento de regulaciones específicas?",
      "No se identifican requisitos especiales.",
      "Requisitos estándar y de bajo impacto, fácilmente verificables.",
      "Permisos/certificaciones específicos u obligaciones relevantes.",
      "Actividad fuertemente regulada o cuyo incumplimiento puede generar sanciones relevantes."
    ],
    "J2": [
      "¿El proveedor incorporará personal en instalaciones de ITM o participará directamente en actividades bajo coordinación operativa de la organización?",
      "No incorpora personal ni participa en actividades operativas de ITM.",
      "Acceso ocasional y acotado, sin integración a la operación.",
      "Personal recurrente en sitio o interacción frecuente con equipos de ITM.",
      "Participación continua en actividades operativas o coordinación estrecha que exige revisión de responsabilidades."
    ],
    "J3": [
      "¿La relación implica condiciones especiales como exclusividad, propiedad intelectual, uso de marca, indemnizaciones, garantías o compromisos de largo plazo?",
      "No; condiciones comerciales estándar.",
      "Cláusulas estándar, limitadas y preaprobadas.",
      "Obligaciones especiales o derechos que requieren negociación/revisión.",
      "Exclusividad, transferencia/licencia de propiedad intelectual crítica, indemnidades amplias o compromisos difíciles de terminar."
    ],
    "T1": [
      "¿El proveedor requerirá acceso a sistemas, aplicaciones, redes, infraestructura o credenciales de ITM?",
      "No requiere acceso a activos tecnológicos de ITM.",
      "Acceso limitado, temporal o a entornos no críticos.",
      "Cuenta nominativa con acceso a sistemas o información interna relevante.",
      "Acceso privilegiado/administrativo, remoto o a infraestructura/sistemas críticos."
    ],
    "T2": [
      "¿El proveedor tendrá acceso, recibirá, almacenará o procesará información personal, financiera, confidencial o estratégica de ITM?",
      "No accede ni procesa información de ITM.",
      "Solo información pública o interna de baja sensibilidad.",
      "Información confidencial, financiera o comercial relevante, de alcance limitado.",
      "Datos personales/sensibles, credenciales o volúmenes amplios de información crítica."
    ],
    "T3": [
      "¿La relación contempla desarrollo de software, integraciones, alojamiento de información, soporte remoto o administración de sistemas?",
      "No contempla actividades tecnológicas ni tratamiento de información.",
      "Soporte puntual sin acceso relevante ni cambios a sistemas.",
      "Desarrollo/integración/hosting acotado o soporte con acceso controlado.",
      "Administración u operación continua de sistemas, hosting crítico o control de código/infraestructura."
    ]
  },
  "guides": {
    "G1": "¿El proveedor tendrá acceso a sistemas, redes, credenciales o a información personal, financiera, confidencial o estratégica de ITM?",
    "G2": "¿Incluye desarrollo de software, integraciones, hosting, soporte remoto o administración de sistemas?",
    "G3": "¿Habrá personal del proveedor en instalaciones de ITM o participando en actividades bajo coordinación operativa de ITM?",
    "G4": "¿Se requieren permisos, licencias, certificaciones o cumplimiento regulatorio específico?",
    "G5": "¿Hay exclusividad, propiedad intelectual, uso de marca, indemnizaciones, garantías o compromisos de largo plazo?",
    "G6": "¿Hay anticipos, depósitos, pagos no reembolsables, garantías o consumos mínimos?",
    "G7": "¿Puede haber penalizaciones, variaciones de precio, renovaciones o cancelaciones con costo?"
  },
  "triggers": [
    [
      "Acceso a información personal o confidencial",
      "Legal / Privacidad / TI",
      "tipo de datos, finalidad, volumen, almacenamiento, conservación y eliminación",
      "no avanzar hasta completar la revisión y los controles aplicables."
    ],
    [
      "Acceso a infraestructura o sistemas de ITM",
      "TI / Seguridad",
      "sistema, tipo de acceso, privilegios, duración y controles",
      "no otorgar accesos antes de la autorización técnica."
    ],
    [
      "Desarrollo de software o propiedad intelectual",
      "Legal + TI",
      "alcance, entregables, titularidad, licencias, repositorios y aceptación",
      "definir derechos, seguridad y entregables antes de iniciar."
    ],
    [
      "Servicio crítico para la continuidad operativa",
      "Responsable operativo de la UDN + Legal según impacto",
      "impacto, continuidad, SLA, contingencia y sustitución",
      "definir continuidad, niveles de servicio y plan de salida."
    ],
    [
      "Obligaciones regulatorias o responsabilidades especiales",
      "Legal / Compliance / área técnica",
      "permisos, licencias, certificaciones y obligaciones aplicables",
      "validar cumplimiento antes de habilitar."
    ],
    [
      "Anticipos, garantías o penalizaciones relevantes",
      "Finanzas + Legal",
      "importes, calendario, garantías, penalizaciones y condiciones de recuperación",
      "validar exposición y autorizaciones financieras."
    ]
  ],
  "current": 14000,
  "expanded": 25000,
  "absolute": null,
  "bands": [
    25000,
    100000
  ],
  "months": 12,
  "alert": 80,
  "applyBelow": false,
  "eligible": [
    0,
    1
  ],
  "notify": true,
  "budget": true,
  "legal": [
    "Excepción",
    "Excepción",
    "Siempre"
  ],
  "exclusions": [
    "¿Incluye mano de obra?",
    "¿Requiere fianzas?",
    "¿Es construcción o ejecución de obra?",
    "¿Es equipo o maquinaria nueva?",
    "¿Es arrendamiento de maquinaria?"
  ],
  "active": [
    true,
    true,
    true,
    true,
    true
  ],
  "types": [
    "Material de obra",
    "Equipo o maquinaria usada",
    "Equipo o maquinaria nueva",
    "Arrendamiento de maquinaria",
    "Subcontrato o mano de obra",
    "Servicio profesional",
    "Otro"
  ],
  "nature": [
    "Cuantitativa",
    "Cuantitativa",
    "Cuantitativa",
    "Cualitativa",
    "Cualitativa",
    "Cualitativa",
    "Cualitativa"
  ],
  "profiles": [
    [
      1,
      1,
      1
    ],
    [
      1,
      1,
      1
    ],
    [
      1,
      1,
      1
    ],
    [
      2,
      2,
      2
    ],
    [
      2,
      2,
      2
    ],
    null,
    null
  ],
  "prefill": [
    null,
    null,
    3,
    4,
    0,
    null,
    null
  ],
  "works": {
    "OBR": "Construcción · Obra principal",
    "CRJ": "Cabo Rojo"
  },
  "recommendations": [
    "Completar las 12 respuestas",
    "Orden de Servicio (OS), sujeta a las reglas y autorizaciones vigentes de ITM",
    "Contrato Marco, según determine Legal",
    "Contrato formal y controles especializados definidos por Legal y las áreas competentes"
  ],
  "reduced": false,
  "authorization": true,
  "requireFormat": true,
  "version": 1
};
