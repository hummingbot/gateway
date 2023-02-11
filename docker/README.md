# Docker commands

> The followings scripts require Docker to already be installed.

## Setup: enabling user permissions

The scripts below assume that the user has `docker` permissions without requiring `sudo`.

If you do not have `docker` permissions:

1. Enter the following command:

  ```
  sudo usermod -a -G docker $USER
  ```

2. Log out and log back into the terminal to enable.

## Download all scipts

#### Linux
```
wget https://raw.githubusercontent.com/hummingbot/gateway/main/docker/create.sh
chmod a+x *.sh
```

#### MacOS
```
curl https://raw.githubusercontent.com/hummingbot/gateway/main/docker/create.sh -o create.sh
chmod a+x *.sh
```

#### Windows (Docker Toolbox)
```
cd ~
curl https://raw.githubusercontent.com/hummingbot/gateway/main/docker/create.sh -o create.sh
chmod a+x *.sh
```

## Create an instance of Gateway

The `create.sh` script helps you pull, configure, and run the Gateway Docker image.

```
./create.sh
```

## Updating Hummingbot version

The `update.sh` script will update your Gateway instance.

```
./update.sh
```
