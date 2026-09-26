export async function load(url, context, nextLoad) {
 if (url.endsWith('/src/audio.js')) return {format:'module',source:'export const playSound=()=>{};',shortCircuit:true};
 if (url.endsWith('/src/logger.js')) return {format:'module',source:'export const gameLog=()=>{};',shortCircuit:true};
 if (/\.(png|webp|jpg|woff2)$/.test(url)) return {format:'module',source:'export default ""',shortCircuit:true};
 return nextLoad(url,context);
}
