from pymodbus.client import ModbusSerialClient
import time

PORT     = "COM14"
SLAVE_ID = 1
ADRESSE  = 50514   # Premier registre du Diris A40

# Combinaisons à tester (baudrate, parité)
COMBINAISONS = [
    (9600,  'E'),
    (9600,  'N'),
    (9600,  'O'),
    (19200, 'E'),
    (19200, 'N'),
    (19200, 'O'),
    (38400, 'E'),
    (38400, 'N'),
    (38400, 'O'),
]

print("=" * 55)
print("  Scan RS485 — Socomec Diris A40")
print(f"  Port : {PORT}  |  Slave : {SLAVE_ID}")
print("=" * 55)

trouve = False

for baudrate, parity in COMBINAISONS:
    label = f"{baudrate} bauds / parité={parity}"
    print(f"\n  Test : {label} ...", end="", flush=True)

    client = ModbusSerialClient(
        port=PORT,
        baudrate=baudrate,
        parity=parity,
        stopbits=1,
        bytesize=8,
        timeout=2,
    )

    try:
        ok = client.connect()
        if not ok:
            print(" ✗ connexion port impossible")
            continue

        reponse = client.read_holding_registers(
            address=ADRESSE,
            count=2,
            slave=SLAVE_ID,
        )

        if reponse.isError():
            print(f" ✗ erreur : {reponse}")
        else:
            val = (reponse.registers[0] << 16 | reponse.registers[1]) / 100
            print(f"\n\n  ✓✓✓ TROUVÉ ! {label}")
            print(f"       Tension U12 lue : {val} V")
            print(f"\n  → Mettre dans modbus_reader.py :")
            print(f"       BAUDRATE = {baudrate}")
            print(f"       PARITY   = '{parity}'")
            trouve = True

    except Exception as e:
        print(f" ✗ exception : {e}")
    finally:
        client.close()

    if trouve:
        break

    time.sleep(0.3)

print("\n" + "=" * 55)
if not trouve:
    print("  ✗ Aucune combinaison n'a fonctionné.")
    print("  → Vérifiez les paramètres RS485 sur l'écran du compteur")
    print("  → Menu : PARAM > COM > RS485")
    print("  → Vérifiez le câblage A/B du convertisseur USB-RS485")
print("=" * 55)
