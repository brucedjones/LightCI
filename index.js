#! /usr/bin/env node

const light = require('./lightci');
const program = require('commander');

program
  .description('Serverless CI with GitHub')
  .option('-c, --config </path/to/config>', 'Configuration file')
  .parse(process.argv);

var conf = './light.json';
if(program.config) conf = program.config;

try {
    light(require(conf));
} catch (err) {
    console.log(err);
}