export const ReportStatus = Object.freeze({
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
});

export const HistoryEntryType = Object.freeze({
  CREATED: "CREACION",
  UPDATE: "ACTUALIZACION",
  STATUS_CHANGE: "CAMBIO_ESTADO",
});

export const StatusMeta = Object.freeze({
  [ReportStatus.GREEN]: {
    label: "Solucionado",
    tone: "green",
    description: "Situación normal, solucionada o sin problemas relevantes.",
    rank: 1,
  },
  [ReportStatus.YELLOW]: {
    label: "En progreso",
    tone: "yellow",
    description: "Situación que requiere atención o presenta un problema moderado.",
    rank: 2,
  },
  [ReportStatus.RED]: {
    label: "Pendiente",
    tone: "red",
    description: "Situación crítica o que requiere atención inmediata.",
    rank: 3,
  },
});

export const statuses = Object.values(ReportStatus);
