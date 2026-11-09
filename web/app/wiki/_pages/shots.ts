// The Wiki's screenshots (public/images/wiki/<language>/<name>.png) and their sizes in pixels.
// Taken from a demo event with invented names; when a screen changes, retake it in both
// languages and update its size here.
export const SHOTS = {
  en: {
    'control-panel': [1024, 470],
    'db-create': [372, 809],
    'db-local': [372, 985],
    'db-offline': [372, 945],
    'ec-add-teams': [1114, 246],
    'ec-division-settings': [1110, 379],
    'ec-new-division': [1168, 264],
    'ec-new-event': [1180, 218],
    'ec-playing': [1184, 118],
    'ec-round': [1042, 484],
    'hj-header': [1200, 140],
    'hj-play-running': [1200, 734],
    'hj-play': [1200, 734],
    'hj-pools': [1200, 410],
    'hj-results': [1200, 762],
    'judge-home': [780, 940],
    'judge-pin': [780, 1180],
    'judge-screen': [780, 1560],
    'public-results': [900, 560],
  },
  es: {
    'control-panel': [1024, 470],
    'db-create': [372, 841],
    'db-local': [372, 1001],
    'db-offline': [372, 961],
    'ec-add-teams': [1114, 246],
    'ec-division-settings': [1110, 379],
    'ec-new-division': [1168, 264],
    'ec-new-event': [1180, 218],
    'ec-playing': [1184, 118],
    'ec-round': [1030, 484],
    'hj-header': [1200, 140],
    'hj-play-running': [1200, 734],
    'hj-play': [1200, 734],
    'hj-pools': [1200, 410],
    'hj-results': [1200, 782],
    'judge-home': [780, 940],
    'judge-pin': [780, 1180],
    'judge-screen': [780, 1560],
    'public-results': [900, 560],
  },
} as const;

export type ShotName = keyof (typeof SHOTS)['en'];
