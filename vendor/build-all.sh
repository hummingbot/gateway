for d in $(find /Users/hummingbot/work/coinalpha/gateway/vendor/@ethersproject-xdc -maxdepth 1 -type d)
do
  yarn build
done

