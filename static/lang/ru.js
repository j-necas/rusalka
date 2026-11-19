// Русский словарь, объединённый из отдельных областей.
import aplikace from './ru/app.js';
import doplnky from './ru/extras.js';
import cviceni from './ru/practice.js';
import editor from './ru/editor.js';

export default { ...aplikace, ...doplnky, ...cviceni, ...editor };
