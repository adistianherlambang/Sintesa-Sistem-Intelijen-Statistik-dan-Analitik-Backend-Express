const date = new Date

const month = date.getMonth()
const year = String(date.getFullYear()).slice(2, 4);

console.log(String(1) + year + month)