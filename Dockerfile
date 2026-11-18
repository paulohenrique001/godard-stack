FROM node:26-alpine AS frontend-deps
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

FROM frontend-deps AS frontend-build
COPY frontend/ ./
RUN npm run build

FROM maven:3.9-eclipse-temurin-21-alpine AS backend-build
WORKDIR /app
COPY backend/pom.xml ./
COPY backend/src ./src
COPY --from=frontend-build /app/frontend/dist ./src/main/resources/static
RUN mvn -B package

FROM eclipse-temurin:21-jdk-alpine AS runtime-build
RUN jlink \
    --add-modules java.base,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.security.jgss,java.sql,java.xml,jdk.unsupported \
    --strip-debug \
    --no-man-pages \
    --no-header-files \
    --compress=zip-6 \
    --generate-cds-archive \
    --output /runtime
RUN rm /runtime/lib/server/classes_nocoops.jsa /runtime/bin/keytool

FROM maven:3.9-eclipse-temurin-21-alpine AS dev
RUN apk add --no-cache bash libstdc++ libatomic
ENV MAVEN_OPTS="-Xmx256m -XX:+UseSerialGC -XX:TieredStopAtLevel=1"
COPY --from=frontend-deps /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY frontend/ frontend/
COPY --from=frontend-deps /app/frontend/node_modules frontend/node_modules
COPY backend/ backend/
COPY scripts/dev-container.sh ./
CMD ["bash", "dev-container.sh"]

FROM alpine:3.22
COPY --from=runtime-build /runtime /opt/java
COPY --from=backend-build /app/target/*.jar /app/app.jar
RUN install -d -o 1000 -g 1000 /data
USER 1000
ENTRYPOINT ["/opt/java/bin/java", "-XX:+UseSerialGC", "-XX:TieredStopAtLevel=1", "-Xss512k", "-Xms8m", "-Xmx48m", "-XX:MinHeapFreeRatio=10", "-XX:MaxHeapFreeRatio=25", "-XX:MaxMetaspaceSize=64m", "-XX:ReservedCodeCacheSize=24m", "-jar", "/app/app.jar"]
