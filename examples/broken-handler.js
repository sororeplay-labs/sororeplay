import good from './credit-handler.js';
// Deliberately broken: forget every delivery ID, so duplicate events are credited twice.
export default { ...good, apply: (state, event) => good.apply({ ...state, seen: [] }, event) };
