const fs = require('fs');
let schema = fs.readFileSync('src/prisma/contract.prisma', 'utf8');

// The simplest way is to manually replace the types since there are only a few.
schema = schema.replace(/String\s+@id\s+@default\(uuid\(\)\)\s+@db\.Uuid/g, 'Uuid @id @default(uuid())');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid? @map("$2")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid @map("$2")');
schema = schema.replace(/String\s+@unique\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid @unique @map("$2")');

schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2) @map("$1")');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2)? @map("$1")');

schema = schema.replace(/String\?\s+@unique\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2)? @unique @map("$1")');
schema = schema.replace(/String\s+@unique\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2) @unique @map("$1")');

schema = schema.replace(/String\?\s+@unique\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)? @unique');
schema = schema.replace(/String\s+@unique\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1) @unique');

schema = schema.replace(/String\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)');
schema = schema.replace(/String\?\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)?');

schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Char\((\d+)\)/g, 'Char($2)? @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Char\((\d+)\)/g, 'Char($2) @map("$1")');

schema = schema.replace(/String\?\s+@db\.Text/g, 'Text?');
schema = schema.replace(/String\s+@db\.Text/g, 'Text');

schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Text/g, 'Text? @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Text/g, 'Text @map("$1")');

schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Inet/g, 'Inet? @map("$1")');

// DateTime replacements
schema = schema.replace(/DateTime\s+@default\(now\(\)\)\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @default(now()) @map("$1")');
schema = schema.replace(/DateTime\s+@updatedAt\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @default(temporal.updatedAt()) @map("$1")');
schema = schema.replace(/DateTime\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @map("$1")');
schema = schema.replace(/DateTime\?\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz? @map("$1")');

schema = schema.replace(/DateTime\s+@updatedAt/g, 'Timestamptz @default(temporal.updatedAt())');
schema = schema.replace(/@updatedAt/g, '@default(temporal.updatedAt())');

// Cleanup double mapping bug in my regex
schema = schema.replace(/VarChar\((\d+)\)\s+@map\("VarChar/g, 'VarChar($1) @map("'); // Just in case my previous script messed it up, but I'll read from prisma/schema.prisma to start clean!

let freshSchema = fs.readFileSync('prisma/schema.prisma', 'utf8');
// apply on freshSchema
schema = freshSchema;
schema = schema.replace(/String\s+@id\s+@default\(uuid\(\)\)\s+@db\.Uuid/g, 'Uuid @id @default(uuid())');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid? @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid @map("$1")');
schema = schema.replace(/String\s+@unique\s+@map\("([^"]+)"\)\s+@db\.Uuid/g, 'Uuid @unique @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2) @map("$1")');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2)? @map("$1")');
schema = schema.replace(/String\?\s+@unique\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2)? @unique @map("$1")');
schema = schema.replace(/String\s+@unique\s+@map\("([^"]+)"\)\s+@db\.VarChar\((\d+)\)/g, 'VarChar($2) @unique @map("$1")');
schema = schema.replace(/String\?\s+@unique\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)? @unique');
schema = schema.replace(/String\s+@unique\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1) @unique');
schema = schema.replace(/String\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)');
schema = schema.replace(/String\?\s+@db\.VarChar\((\d+)\)/g, 'VarChar($1)?');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Char\((\d+)\)/g, 'Char($2)? @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Char\((\d+)\)/g, 'Char($2) @map("$1")');
schema = schema.replace(/String\?\s+@db\.Text/g, 'Text?');
schema = schema.replace(/String\s+@db\.Text/g, 'Text');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Text/g, 'Text? @map("$1")');
schema = schema.replace(/String\s+@map\("([^"]+)"\)\s+@db\.Text/g, 'Text @map("$1")');
schema = schema.replace(/String\?\s+@map\("([^"]+)"\)\s+@db\.Inet/g, 'Inet? @map("$1")');
schema = schema.replace(/DateTime\s+@default\(now\(\)\)\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @default(now()) @map("$1")');
schema = schema.replace(/DateTime\s+@updatedAt\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @default(temporal.updatedAt()) @map("$1")');
schema = schema.replace(/DateTime\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz @map("$1")');
schema = schema.replace(/DateTime\?\s+@map\("([^"]+)"\)\s+@db\.Timestamptz/g, 'Timestamptz? @map("$1")');
schema = schema.replace(/DateTime\s+@updatedAt/g, 'Timestamptz @default(temporal.updatedAt())');
schema = schema.replace(/@updatedAt/g, '@default(temporal.updatedAt())');

// And remove datasource/generator block, Prisma 8 uses config file for that
schema = schema.replace(/generator client {[\s\S]*?}/, '');
schema = schema.replace(/datasource db {[\s\S]*?}/, '');

fs.writeFileSync('src/prisma/contract.prisma', schema);
console.log("Schema rewritten cleanly!");
