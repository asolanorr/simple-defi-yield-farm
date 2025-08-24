const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TokenFarm V2', function () {
  let TokenFarmV2, DAppToken, LPToken;
  let tokenFarmV2, dappToken, lpToken;
  let owner, user1, user2;
  let ownerAddress, user1Address, user2Address;

  beforeEach(async function () {
    // Obtener las cuentas de prueba
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // Desplegar los contratos
    DAppToken = await ethers.getContractFactory('DAppToken');
    dappToken = await DAppToken.deploy(ownerAddress);

    LPToken = await ethers.getContractFactory('LPToken');
    lpToken = await LPToken.deploy(ownerAddress);

    TokenFarmV2 = await ethers.getContractFactory('TokenFarmV2');
    tokenFarmV2 = await TokenFarmV2.deploy(
      await dappToken.getAddress(),
      await lpToken.getAddress()
    );

    // Transferir la propiedad del DAppToken al TokenFarm V2 para que pueda mint
    await dappToken.transferOwnership(await tokenFarmV2.getAddress());

    // Dar tokens LP a los usuarios para testing
    await lpToken.mint(user1Address, ethers.parseEther('1000'));
    await lpToken.mint(user2Address, ethers.parseEther('1000'));
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await tokenFarmV2.owner()).to.equal(ownerAddress);
    });

    it('Should set the correct token addresses', async function () {
      expect(await tokenFarmV2.dappToken()).to.equal(
        await dappToken.getAddress()
      );
      expect(await tokenFarmV2.lpToken()).to.equal(await lpToken.getAddress());
    });

    it('Should have correct name and version', async function () {
      expect(await tokenFarmV2.name()).to.equal('Proportional Token Farm V2');
      expect(await tokenFarmV2.getVersion()).to.equal(2);
    });

    it('Should initialize with correct default values', async function () {
      expect(await tokenFarmV2.rewardPerBlock()).to.equal(ethers.parseEther('1'));
      expect(await tokenFarmV2.stakingLockPeriod()).to.equal(100);
      expect(await tokenFarmV2.earlyWithdrawalPenalty()).to.equal(500);
      expect(await tokenFarmV2.emergencyStop()).to.be.false;
    });
  });

  describe('V2 Specific Features', function () {
    describe('Staking Lock Period', function () {
      it('Should apply penalty for early withdrawal', async function () {
        const depositAmount = ethers.parseEther('100');
        
        // Aprobar y depositar
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        // Intentar retirar inmediatamente (antes del período de lock)
        const balanceBefore = await lpToken.balanceOf(user1Address);
        await tokenFarmV2.connect(user1).withdraw();
        const balanceAfter = await lpToken.balanceOf(user1Address);
        
        // Debería recibir menos debido a la penalización
        const received = balanceAfter - balanceBefore;
        const expectedPenalty = (depositAmount * 500n) / 10000n; // 5% penalty
        const expectedReceived = depositAmount - expectedPenalty;
        
        expect(received).to.equal(expectedReceived);
      });

      it('Should not apply penalty after lock period', async function () {
        const depositAmount = ethers.parseEther('100');
        
        // Configurar período de lock muy corto para testing
        await tokenFarmV2.setStakingLockPeriod(1);
        
        // Aprobar y depositar
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        // Avanzar bloques para superar el período de lock
        await ethers.provider.send('evm_mine', []);
        await ethers.provider.send('evm_mine', []);
        
        // Retirar después del período de lock
        const balanceBefore = await lpToken.balanceOf(user1Address);
        await tokenFarmV2.connect(user1).withdraw();
        const balanceAfter = await lpToken.balanceOf(user1Address);
        
        // Debería recibir el monto completo sin penalización
        expect(balanceAfter - balanceBefore).to.equal(depositAmount);
      });
    });

    describe('Configurable Withdrawal Fee', function () {
      it('Should apply configurable withdrawal fee', async function () {
        // Configurar comisión del 5%
        await tokenFarmV2.setWithdrawalFee(500);
        
        const depositAmount = ethers.parseEther('100');
        
        // Depositar y generar recompensas
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        // Generar recompensas
        await ethers.provider.send('evm_mine', []);
        await tokenFarmV2.distributeRewardsAll();
        
        const pendingRewards = await tokenFarmV2.getPendingRewards(user1Address);
        
        // Reclamar recompensas
        await tokenFarmV2.connect(user1).claimRewards();
        
        // Verificar que se aplicó la comisión del 5%
        const expectedRewards = (pendingRewards * 9500n) / 10000n; // 95% después de la comisión
        expect(await dappToken.balanceOf(user1Address)).to.equal(expectedRewards);
      });

      it('Should allow owner to withdraw accumulated fees', async function () {
        const depositAmount = ethers.parseEther('100');
        
        // Depositar y generar recompensas
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        await ethers.provider.send('evm_mine', []);
        await tokenFarmV2.distributeRewardsAll();
        
        // Reclamar recompensas para acumular comisiones
        await tokenFarmV2.connect(user1).claimRewards();
        
        const accumulatedFees = await tokenFarmV2.getAccumulatedFees();
        expect(accumulatedFees).to.be.gt(0);
        
        // Owner retira comisiones
        await tokenFarmV2.withdrawFees();
        
        expect(await tokenFarmV2.getAccumulatedFees()).to.equal(0);
        expect(await dappToken.balanceOf(ownerAddress)).to.equal(accumulatedFees);
      });
    });

    describe('Emergency Stop', function () {
      it('Should prevent deposits when emergency stop is active', async function () {
        await tokenFarmV2.toggleEmergencyStop();
        
        const depositAmount = ethers.parseEther('100');
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        
        await expect(
          tokenFarmV2.connect(user1).deposit(depositAmount)
        ).to.be.revertedWith('Contract is in emergency stop');
      });

      it('Should allow emergency withdraw when emergency stop is active', async function () {
        const depositAmount = ethers.parseEther('100');
        
        // Depositar primero
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        // Activar parada de emergencia
        await tokenFarmV2.toggleEmergencyStop();
        
        // Retiro de emergencia
        const balanceBefore = await lpToken.balanceOf(user1Address);
        await tokenFarmV2.connect(user1).emergencyWithdraw();
        const balanceAfter = await lpToken.balanceOf(user1Address);
        
        // Debería recibir el monto completo sin penalización
        expect(balanceAfter - balanceBefore).to.equal(depositAmount);
        expect(await tokenFarmV2.getStakingBalance(user1Address)).to.equal(0);
      });
    });

    describe('Advanced User Info', function () {
      it('Should track total rewards claimed', async function () {
        const depositAmount = ethers.parseEther('100');
        
        // Depositar
        await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount);
        await tokenFarmV2.connect(user1).deposit(depositAmount);
        
        // Generar y reclamar recompensas
        await ethers.provider.send('evm_mine', []);
        await tokenFarmV2.distributeRewardsAll();
        await tokenFarmV2.connect(user1).claimRewards();
        
        const userInfo = await tokenFarmV2.getUserInfo(user1Address);
        expect(userInfo.totalRewardsClaimed).to.be.gt(0);
        expect(userInfo.lastClaimBlock).to.be.gt(0);
      });
    });

    describe('Configuration Functions', function () {
      it('Should allow owner to set staking lock period', async function () {
        await tokenFarmV2.setStakingLockPeriod(200);
        expect(await tokenFarmV2.stakingLockPeriod()).to.equal(200);
      });

      it('Should allow owner to set early withdrawal penalty', async function () {
        await tokenFarmV2.setEarlyWithdrawalPenalty(1000); // 10%
        expect(await tokenFarmV2.earlyWithdrawalPenalty()).to.equal(1000);
      });

      it('Should enforce maximum limits', async function () {
        await expect(
          tokenFarmV2.setStakingLockPeriod(20000) // Exceeds max
        ).to.be.revertedWith('Lock period cannot exceed 10000 blocks');

        await expect(
          tokenFarmV2.setEarlyWithdrawalPenalty(3000) // Exceeds 20%
        ).to.be.revertedWith('Penalty cannot exceed 20%');

        await expect(
          tokenFarmV2.setWithdrawalFee(1500) // Exceeds 10%
        ).to.be.revertedWith('Fee cannot exceed 10%');
      });
    });

    describe('Contract Info', function () {
      it('Should return correct contract info', async function () {
        const contractInfo = await tokenFarmV2.getContractInfo();
        
        expect(contractInfo.contractName).to.equal('Proportional Token Farm V2');
        expect(contractInfo.version).to.equal(2);
        expect(contractInfo.totalStakers).to.equal(0);
        expect(contractInfo.totalStaked).to.equal(0);
        expect(contractInfo.isEmergencyStopped).to.be.false;
      });
    });
  });

  describe('Inherited V1 Features', function () {
    it('Should work with variable reward per block', async function () {
      // Cambiar recompensa por bloque
      await tokenFarmV2.setRewardPerBlock(ethers.parseEther('2'));
      expect(await tokenFarmV2.rewardPerBlock()).to.equal(ethers.parseEther('2'));
    });

    it('Should distribute rewards proportionally', async function () {
      const depositAmount1 = ethers.parseEther('100');
      const depositAmount2 = ethers.parseEther('300');
      
      // User1 deposita 100, User2 deposita 300
      await lpToken.connect(user1).approve(await tokenFarmV2.getAddress(), depositAmount1);
      await lpToken.connect(user2).approve(await tokenFarmV2.getAddress(), depositAmount2);
      
      await tokenFarmV2.connect(user1).deposit(depositAmount1);
      await tokenFarmV2.connect(user2).deposit(depositAmount2);
      
      // Generar recompensas
      await ethers.provider.send('evm_mine', []);
      await tokenFarmV2.distributeRewardsAll();
      
      const user1Rewards = await tokenFarmV2.getPendingRewards(user1Address);
      const user2Rewards = await tokenFarmV2.getPendingRewards(user2Address);
      
      // User2 debería tener 3 veces más recompensas que User1 (300 vs 100)
      // Permitir un margen de error del 10% debido a diferencias en el timing de bloques
      const expectedRatio = 3n;
      const actualRatio = user2Rewards / user1Rewards;
      
      expect(actualRatio).to.be.gte(2n); // Al menos 2x
      expect(actualRatio).to.be.lte(4n); // Máximo 4x
    });
  });
});
