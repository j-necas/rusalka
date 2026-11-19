// English: a dictionary merged from areas (each area has its own file so they can be worked on separately).
import aplikace from './en/app.js';
import doplnky from './en/extras.js';
import cviceni from './en/practice.js';
import editor from './en/editor.js';

export default { ...aplikace, ...doplnky, ...cviceni, ...editor };
