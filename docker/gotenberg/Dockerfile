FROM gotenberg/gotenberg:8.38.1-libreoffice

USER root

RUN echo "deb http://deb.debian.org/debian trixie contrib non-free" +      > /etc/apt/sources.list.d/contrib.list +    && echo "ttf-mscorefonts-installer msttcorefonts/accepted-mscorefonts-eula select true" +      | debconf-set-selections +    && apt-get update -qq +    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends +      ca-certificates +      fontconfig +      wget +      ttf-mscorefonts-installer +    && fc-cache -f +    && rm -rf /var/lib/apt/lists/*

COPY --chmod=755 verify-fonts.sh /usr/local/bin/verify-align-fonts

RUN /usr/local/bin/verify-align-fonts

USER gotenberg
