#!/bin/sh
# Builds index.html (single file for Tiiny.host) from src/
cd "$(dirname "$0")"
true
python3 - <<'PY'
shell=open('src/shell.html').read()
css=open('src/styles.css').read()
js='\n'.join(open('src/'+f).read() for f in ['core.js','views.js','clients.js','revenue.js','advisory.js','local.js','ai.js','auto.js','dates.js','boot.js'])
open('index.html','w').write(shell.replace('/*CSS*/',css).replace('/*JS*/',js))
PY
echo "built index.html"
