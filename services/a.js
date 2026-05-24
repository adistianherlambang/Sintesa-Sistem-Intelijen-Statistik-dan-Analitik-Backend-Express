const date = new Date

const month = date.getMonth()
const year = String(date.getFullYear()).slice(2, 4);
const yoy = year - 1

console.log(String(1) + yoy + month )