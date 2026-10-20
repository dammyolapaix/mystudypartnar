# The workflow service image includes LibreOffice

Office Sources are converted with LibreOffice (`soffice`) through `libreoffice-convert`. A serverless host cannot run that binary. The service that handles the Upstash Workflow route runs from an image that includes LibreOffice, so conversion and the rest of preparation share one deploy. A separate conversion service would be a second system to run and call.
