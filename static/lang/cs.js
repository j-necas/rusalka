// Čeština: slovník sloučený z oblastí (každá oblast má vlastní soubor, aby na nich šlo pracovat odděleně).
import aplikace from './cs/app.js';
import doplnky from './cs/extras.js';
import cviceni from './cs/practice.js';
import editor from './cs/editor.js';

export default { ...aplikace, ...doplnky, ...cviceni, ...editor };
