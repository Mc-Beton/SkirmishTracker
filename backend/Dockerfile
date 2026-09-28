# Production image of the Spring Boot backend. Build context: backend/
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null
COPY src src
# Tests run in CI (they need Docker for Testcontainers); the image only packages the app.
RUN ./gradlew --no-daemon bootJar -x test && cp build/libs/*.jar /app.jar

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
USER app
WORKDIR /app
COPY --from=build /app.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
