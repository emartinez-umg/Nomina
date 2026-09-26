import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  navigationMenus,
  primaryPages,
  searchCommands,
} from '../frontend/src/components/navigation.js';
import { groups } from '../shared/catalog.js';
import { masterGroups } from '../shared/hr-catalog.js';

const schema = JSON.parse(readFileSync(new URL('../shared/schema.json', import.meta.url)));
const allGroups = [...groups, ...masterGroups];
const commands = [
  ...primaryPages.map((page) => ({ ...page, groupLabel: 'Accesos rápidos' })),
  ...[...schema.tables, ...schema.masters].map((table) => ({
    ...table,
    groupLabel: allGroups.find((group) => group.id === table.group).label,
  })),
];

test('navigation exposes all 51 forms and three standalone pages without duplicate destinations', () => {
  const results = searchCommands(commands, '');
  assert.equal(results.length, 54);
  assert.equal(new Set(results.map((result) => result.slug)).size, 54);
  for (const command of commands) {
    assert.ok(searchCommands(commands, command.title).some((item) => item.slug === command.slug));
  }
});

test('command search accepts accents, case, multiple words and route names', () => {
  assert.ok(
    searchCommands(commands, '  PRESTAMOS anticipos ').some((item) => item.slug === 'prestamo'),
  );
  assert.ok(
    searchCommands(commands, 'PERSONA TELEFONO').some(
      (item) => item.slug === 'erp-persona-telefono',
    ),
  );
  assert.ok(
    searchCommands(commands, 'planilla detalle').some((item) => item.slug === 'nomina-detalle'),
  );
  assert.ok(searchCommands(commands, 'ayuda').some((item) => item.slug === 'guia'));
  assert.deepEqual(searchCommands(commands, 'seccion inexistente xyz'), []);
});

test('category filters constrain results and can be cleared without losing commands', () => {
  for (const group of allGroups) {
    const results = searchCommands(commands, '', group.id);
    assert.ok(results.length > 0);
    assert.ok(results.every((item) => item.group === group.id));
  }
  assert.equal(searchCommands(commands, '', 'general').length, 3);
  assert.deepEqual(searchCommands(commands, 'bancos', 'asistencia'), []);
  assert.ok(searchCommands(commands, 'bancos').some((item) => item.slug === 'erp-banco'));
});

test('named destinations rank above other sections in the same category', () => {
  assert.equal(searchCommands(commands, 'bancos')[0].slug, 'erp-banco');
  assert.equal(searchCommands(commands, 'prestamos')[0].slug, 'prestamo');
  assert.equal(searchCommands(commands, 'empleados')[0].slug, 'empleado');
});

test('dropdown menus expose every CRUD exactly once and cover every category', () => {
  const menuGroups = navigationMenus.flatMap((menu) => menu.groups);
  assert.deepEqual([...menuGroups].sort(), allGroups.map((group) => group.id).sort());
  const destinations = navigationMenus.flatMap((menu) =>
    [...schema.tables, ...schema.masters].filter((table) => menu.groups.includes(table.group)),
  );
  assert.equal(destinations.length, 51);
  assert.equal(new Set(destinations.map((table) => table.slug)).size, 51);
});
