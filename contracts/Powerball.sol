// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol"; // random num
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol"; // automation

error Powerball__PaymentInsufficient();
error Powerball__GuessNotWithinRange();
error Powerball__WithdrawalFailed();
error Powerball__NotOpen();
error Powerball__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 state);

/**@title Decentralized powerball lottery game
 * @author Diego A. Garay
 * @notice This contract creates an automated decentralized powerball lottery game that chooses a winner (if found) at every interval that was specified
 * @dev This implements the Chainlink VRF Version 2
 */

contract Powerball is VRFConsumerBaseV2, KeeperCompatibleInterface {
    enum PowerballState {
        OPEN,
        CALCULATING
    }
    // State variables
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private immutable i_callbackGasLimit;
    uint32 private constant NUM_WORDS = 5;

    // Powerball variables
    address[] private s_players;
    address[] private s_winners;
    address[] private s_recentWinners;
    PowerballState private s_powerballState;
    uint256 private s_lastTimeStamp;
    uint256[] private s_lastNumbers;
    uint256 private immutable i_interval;
    mapping(address => uint256) s_totalWins;
    mapping(address => uint256) s_totalWon;
    mapping(address => uint8[]) s_playerGuesses;
    uint256 private immutable i_ticketPrice;
    uint8 private constant MIN_GUESS = 1;
    uint8 private constant MAX_GUESS = 69;

    // Events
    event GameEntered(address indexed player);
    event RequestedWinningNumbers(uint256 indexed requestId);
    event WinnersPicked(address[] indexed winner);

    constructor(
        uint256 ticketPrice,
        address vrfCoordinatorV2,
        bytes32 keyHash,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_ticketPrice = ticketPrice;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_keyHash = keyHash;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_powerballState = PowerballState.OPEN;
        s_lastTimeStamp = block.timestamp;
        i_interval = interval;
    }

    function enterGame(
        uint8 numberOne,
        uint8 numberTwo,
        uint8 numberThree,
        uint8 numberFour,
        uint8 numberFive
    ) external payable {
        if (msg.value < i_ticketPrice) {
            revert Powerball__PaymentInsufficient();
        }

        if (
            (numberOne < MIN_GUESS || numberOne > MAX_GUESS) ||
            (numberTwo < MIN_GUESS || numberTwo > MAX_GUESS) ||
            (numberThree < MIN_GUESS || numberThree > MAX_GUESS) ||
            (numberFour < MIN_GUESS || numberFour > MAX_GUESS) ||
            (numberFive < MIN_GUESS || numberFive > MAX_GUESS)
        ) {
            revert Powerball__GuessNotWithinRange();
        }

        if (s_powerballState != PowerballState.OPEN) {
            revert Powerball__NotOpen();
        }

        s_players.push(msg.sender);
        s_playerGuesses[msg.sender] = [numberOne, numberTwo, numberThree, numberFour, numberFive];
        emit GameEntered(msg.sender);
    }

    /**
     * @dev This is the function that the Chainlink Keeper nodes call
     * they look for `upkeepNeeded` to return True.
     * the following should be true for this to return true:
     * 1. The time interval has passed between game runs.
     * 2. The powerball game is open.
     * 3. The contract has ETH.
     * 4. Implicity, your subscription is funded with LINK.
     */

    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        bool isOpen = (PowerballState.OPEN == s_powerballState);
        bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
        bool hasPlayers = s_players.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
    }

    function performUpkeep(
        bytes calldata /*performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");

        if (!upkeepNeeded) {
            revert Powerball__UpkeepNotNeeded(
                address(this).balance,
                s_players.length,
                uint256(s_powerballState)
            );
        }

        s_powerballState = PowerballState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );

        emit RequestedWinningNumbers(requestId);
    }

    function fulfillRandomWords(
        uint256, /* requestId */
        uint256[] memory randomWords
    ) internal override {
        uint256 winningNumberOne = 1; // randomWords[0] % s_players.length;
        uint256 winningNumberTwo = 2; // randomWords[1] % s_players.length;
        uint256 winningNumberThree = 3; // randomWords[2] % s_players.length;
        uint256 winningNumberFour = 4; // randomWords[3] % s_players.length;
        uint256 winningNumberFive = 5; // randomWords[4] % s_players.length;

        s_lastNumbers.push(winningNumberOne);
        s_lastNumbers.push(winningNumberTwo);
        s_lastNumbers.push(winningNumberThree);
        s_lastNumbers.push(winningNumberFour);
        s_lastNumbers.push(winningNumberFive);

        findWinners(
            uint8(winningNumberOne),
            uint8(winningNumberTwo),
            uint8(winningNumberThree),
            uint8(winningNumberFour),
            uint8(winningNumberFive)
        );

        s_powerballState = PowerballState.OPEN;
        s_players = new address[](0);
        s_lastTimeStamp = block.timestamp;

        if (s_recentWinners.length != 0) {
            uint256 winnings = address(this).balance / s_recentWinners.length;

            for (uint256 i = 0; i < s_recentWinners.length; i++) {
                address recentWinner = payable(s_recentWinners[i]);
                (bool success, ) = recentWinner.call{value: winnings}("");
                if (!success) {
                    revert Powerball__WithdrawalFailed();
                }
            }
            emit WinnersPicked(s_recentWinners);
        }
    }

    function resetPlayerGuesses() internal {
        for (uint256 i = 0; i < s_players.length; i++) {
            s_playerGuesses[s_players[i]] = new uint8[](0);
        }
    }

    function findWinners(
        uint8 winningNumberOne,
        uint8 winningNumberTwo,
        uint8 winningNumberThree,
        uint8 winningNumberFour,
        uint8 winningNumberFive
    ) internal {
        for (uint256 i = 0; i < s_players.length; i++) {
            uint8[] memory playerGuesses = s_playerGuesses[s_players[i]];

            if (
                playerGuesses[0] == winningNumberOne &&
                playerGuesses[1] == winningNumberTwo &&
                playerGuesses[2] == winningNumberThree &&
                playerGuesses[3] == winningNumberFour &&
                playerGuesses[4] == winningNumberFive
            ) {
                s_recentWinners.push(s_players[i]);
                s_winners.push(s_players[i]);
            }
        }
    }

    function getTicketPrice() public view returns (uint256) {
        return i_ticketPrice;
    }

    function getTotalPlayers() public view returns (uint256) {
        return s_players.length;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getPlayerGuess(address player) public view returns (uint8[] memory) {
        return s_playerGuesses[player];
    }

    function getRecentWinners() public view returns (address[] memory) {
        return s_recentWinners;
    }

    function getState() public view returns (PowerballState) {
        return s_powerballState;
    }

    function getNumWords() public pure returns (uint256) {
        return NUM_WORDS;
    }

    function getLatestTimeStamp() public view returns (uint256) {
        return s_lastTimeStamp;
    }

    function getRequestConfirmations() public pure returns (uint256) {
        return REQUEST_CONFIRMATIONS;
    }

    function getInterval() public view returns (uint256) {
        return i_interval;
    }

    function getPlayerTotalWins(address player) public view returns (uint256) {
        return s_totalWins[player];
    }

    function getPlayerTotalWon(address player) public view returns (uint256) {
        return s_totalWon[player];
    }

    function getTotalWinners() public view returns (uint256) {
        return s_winners.length;
    }

    function getLastNumbers() public view returns (uint256[] memory) {
        return s_lastNumbers;
    }
}
