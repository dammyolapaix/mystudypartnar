# The open page hears preparation finish through Upstash Realtime

A Source's status lives in Postgres. The upload page still needs to change from Preparing to Ready or Failed without polling that row. Upstash Realtime, backed by Upstash Redis, notifies the open page on that workflow run's channel, and the page reads the Source again. Polling would avoid Redis. The realtime endpoint allows only the Student who owns the Source to subscribe to its run.
