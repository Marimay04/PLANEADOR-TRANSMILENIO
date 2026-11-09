from motor.Red import Red

red = Red("datos")

print("CALLE 26:", red.estado("CALLE 26"))         # Debe dar abierta
print("PORTAL NORTE:", red.estado("PORTAL NORTE")) # Debe dar abierta
print("ESTACION FALSA:", red.estado("FALSA"))      # Debe dar no existe
