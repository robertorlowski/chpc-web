#!/bin/bash
# $1 = plik VCD; wypisuje opóźnienie od końca każdej ramki RX do pierwszego zbocza TX
awk '
/\$timescale/ { getline; ts=$1 }
/\$var/ { if ($5=="D0") rx=$4; if ($5=="D1") tx=$4 }
/^#/ { t=substr($0,2)+0; next }
{
  v=substr($0,1,1); id=substr($0,2)
  if (id==rx) { if (inrx && t-lastrx>5e6) { flush() } ; inrx=1; lastrx=t }
  if (id==tx && inrx) { lat[++n]=(t-lastrx)/1e6; inrx=0 }
}
function flush() { lat[++n]=-1; inrx=0 }
END { for (k=1;k<=n;k++) printf "%s ", (lat[k]<0?"brak":sprintf("%.1fms",lat[k])); print "" }
' "$1"
