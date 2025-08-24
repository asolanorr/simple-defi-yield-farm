# simple-defi-yield-farm
ETH - KIPU | Module 5 | FINAL TEST

---

# Ejercicio Simple DeFi Yield Farming

Cómo usar Farms (Yield Farming) en PancakeSwap  
https://docs.pancakeswap.finance/products/yield-farming/how-to-use-farms

---

### Caso de uso

En este ejercicio, implementarás un proyecto DeFi simple de Token Farm.

La Farm debe permitir a los usuarios realizar depósitos y retiros de un token mock LP.  
Los usuarios también pueden reclamar las recompensas generadas durante el staking. Estas recompensas son tokens de la plataforma: nombre: "DApp Token", token: "DAPP".  
El contrato contiene el marco y comentarios necesarios para implementar el contrato. Sigue los comentarios indicados para completarlo.

El caso de uso del contrato Simple Token Farm es el siguiente:

- Los usuarios depositan tokens LP con la función `deposit()`.
- Los usuarios pueden recolectar o reclamar recompensas con la función `claimRewards()`.
- Los usuarios pueden deshacer el staking de todos sus tokens LP con la función `withdraw()`, pero aún pueden reclamar las recompensas pendientes.
- Cada vez que se actualiza la cantidad de tokens LP en staking, las recompensas deben recalcularse primero.
- El propietario de la plataforma puede llamar al método `distributeRewardsAll()` a intervalos regulares para actualizar las recompensas pendientes de todos los usuarios en staking.

---

### Contratos

- `LPToken.sol`: Contrato del token LP, utilizado para el staking.
- `DappToken.sol`: Contrato del token de la plataforma, utilizado como recompensa.
- `TokenFarm.sol`: Contrato de la Farm.

---

## Requisitos

1. Crear un nuevo proyecto _Hardhat_ e incluir el contrato proporcionado.
2. Implementar todas las funciones, eventos y cualquier otro elemento mencionado en los comentarios del código.
3. Desplegar los contratos en un entorno local.

---

### Puntos Extra

Además de las características requeridas, puedes agregar estas características extra para destacar tu código.

---

### Bonus 1: Modifier

Crea funciones `modifier()` que validen:

1. Si el llamador de la función es un usuario que está haciendo staking.
2. Si el llamador de la función es el owner del contrato.

Añade los modifiers a las funciones que los requieran.

---

### Bonus 2: Struct

Crea un `Struct{}` que contenga la información de staking de un usuario y reemplaza los siguientes `mapping()`s:

```solidity
mapping(address => uint256) public stakingBalance;
mapping(address => uint256) public checkpoints;
mapping(address => uint256) public pendigRewards;
mapping(address => bool) public hasStaked;
mapping(address => bool) public isStaking;
```

Por un nuevo `mapping()` de `(address => structUser)`.  
Modifica las funciones correspondientes de acuerdo con este nuevo `mapping()`.

---

### Bonus 3: Pruebas

Crea un archivo de pruebas para el contrato Simple Token Farm que permita verificar:

1. Acuñar (mint) tokens LP para un usuario y realizar un depósito de esos tokens.
2. Que la plataforma distribuya correctamente las recompensas a todos los usuarios en staking.
3. Que un usuario pueda reclamar recompensas y verificar que se transfirieron correctamente a su cuenta.
4. Que un usuario pueda deshacer el staking de todos los tokens LP depositados y reclamar recompensas pendientes, si las hay.

---

### Bonus 4: Recompensas variables por bloque

1. Transforma las recompensas por bloque en un rango y permite al propietario cambiar ese valor.

---

### Bonus 5: Comisión (fee) de retiro

1. Cobra una comisión al momento de reclamar recompensas.
2. Agrega una función para que el propietario pueda retirar esa comisión.

---

### Bonus 6: Proxy (nuevo proyecto)

1. Implementa el bonus 5 como una versión V2 de nuestro contrato de farming.  
   O bien,
2. Nuestra plataforma ha crecido y vamos a implementar farms para más tipos de tokens LP. ¿Cómo podemos resolver el despliegue de nuevos contratos de farming ahorrando gas?
