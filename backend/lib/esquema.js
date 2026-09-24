/*
  sync({ alter: true }) en Postgres arma un ALTER inválido ("syntax error at or
  near REFERENCES") para las columnas con clave foránea, y como es fatal el
  servidor quedaba reiniciándose en bucle. Acá se hace a mano lo que hace falta:
  crear las tablas que no existen y agregar las columnas nuevas de cada modelo.
  No cambia tipos ni borra columnas: eso se hace con una migración a mano.
*/
async function sincronizarEsquema(sequelize) {
  await sequelize.sync();
  return agregarColumnasFaltantes(sequelize);
}

async function agregarColumnasFaltantes(sequelize) {
  const qi = sequelize.getQueryInterface();
  const agregadas = [];
  for (const model of Object.values(sequelize.models)) {
    const tabla = model.getTableName();
    const actual = await qi.describeTable(tabla).catch(() => null);
    if (!actual) continue;
    for (const [nombre, attr] of Object.entries(model.rawAttributes)) {
      const col = attr.field || nombre;
      if (actual[col]) continue;
      const def = { type: attr.type, allowNull: attr.allowNull !== false };
      if (attr.defaultValue !== undefined && typeof attr.defaultValue !== 'function') def.defaultValue = attr.defaultValue;
      try {
        await qi.addColumn(tabla, col, def);
        agregadas.push(`${tabla}.${col}`);
        console.log(`Esquema: columna nueva ${tabla}.${col}`);
      } catch (err) {
        console.error(`Esquema: no se pudo agregar ${tabla}.${col}:`, err.message);
      }
    }
  }
  return agregadas;
}

module.exports = { sincronizarEsquema, agregarColumnasFaltantes };
