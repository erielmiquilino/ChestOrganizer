import { world, system, ItemStack } from '@minecraft/server';

// Function to organize items by type
function organizeItems(items) {
    // Remove undefined/null items
    const validItems = items.filter(item => item && item.typeId);
    
    // Group items by type
    const groupedItems = {};
    validItems.forEach(item => {
        const typeId = item.typeId;
        if (!groupedItems[typeId]) {
            groupedItems[typeId] = [];
        }
        groupedItems[typeId].push(item);
    });
    
    // Combine stacks of the same type
    const combinedItems = [];
    Object.values(groupedItems).forEach(itemGroup => {
        itemGroup.forEach(item => {
            // Look for existing stack of the same type
            const existingStack = combinedItems.find(existing => 
                existing.typeId === item.typeId && 
                existing.amount < existing.maxAmount
            );
            
            if (existingStack) {
                const spaceAvailable = existingStack.maxAmount - existingStack.amount;
                const amountToAdd = Math.min(spaceAvailable, item.amount);
                existingStack.amount += amountToAdd;
                
                // If there's still item left, create new stack
                if (item.amount > amountToAdd) {
                    const newItem = new ItemStack(item.typeId, item.amount - amountToAdd);
                    combinedItems.push(newItem);
                }
            } else {
                combinedItems.push(item);
            }
        });
    });
    
    // Sort by item name
    return combinedItems.sort((a, b) => a.typeId.localeCompare(b.typeId));
}

// Function to organize the chest
function organizeChest(chest) {
    try {
        const container = chest.getComponent('minecraft:inventory').container;
        const items = [];
        
        // Collect all items
        for (let i = 0; i < container.size; i++) {
            const item = container.getItem(i);
            if (item) {
                items.push(item);
            }
        }
        
        // Clear the chest
        for (let i = 0; i < container.size; i++) {
            container.setItem(i, undefined);
        }
        
        // Organize the items
        const organizedItems = organizeItems(items);
        
        // Put organized items back
        organizedItems.forEach((item, index) => {
            if (index < container.size) {
                container.setItem(index, item);
            }
        });
        
        return true;
    } catch (error) {
        console.warn('Error organizing chest:', error);
        return false;
    }
}

// Map to track players who have chests open
const playersWithOpenChests = new Map();

// Event listener for when a player interacts with a block
world.beforeEvents.playerInteractWithBlock.subscribe((eventData) => {
    const { player, block } = eventData;
    
    // Check if it's a chest
    if (block.typeId === 'minecraft:chest' || block.typeId === 'minecraft:trapped_chest') {
        // Register that the player opened a chest
        playersWithOpenChests.set(player.id, {
            player: player,
            chest: block,
            location: block.location
        });
    }
});

// System to detect when chest is closed
system.runInterval(() => {
    for (const [playerId, chestData] of playersWithOpenChests.entries()) {
        const { player, chest, location } = chestData;
        
        try {
            // Check if player still exists and is near the chest
            const distance = Math.sqrt(
                Math.pow(player.location.x - location.x, 2) +
                Math.pow(player.location.y - location.y, 2) +
                Math.pow(player.location.z - location.z, 2)
            );
            
            // If player moved too far away (chest closed) or no longer exists
            if (distance > 6 || !player.isValid()) {
                // Organize the chest
                const success = organizeChest(chest);
                
                if (success && player.isValid()) {
                    player.sendMessage('§a[Organizer] Chest organized automatically!');
                }
                
                // Remove from list
                playersWithOpenChests.delete(playerId);
            }
        } catch (error) {
            // Remove invalid players
            playersWithOpenChests.delete(playerId);
        }
    }
}, 20); // Run every second (20 ticks)

// Manual command to organize (optional)
world.beforeEvents.chatSend.subscribe((eventData) => {
    const { sender: player, message } = eventData;
    
    if (message === '!organizar' || message === '!organize') {
        eventData.cancel = true;
        
        // Look for nearby chest
        const playerLoc = player.location;
        const nearbyBlocks = [];
        
        // Check blocks in a 3x3x3 radius
        for (let x = -2; x <= 2; x++) {
            for (let y = -1; y <= 1; y++) {
                for (let z = -2; z <= 2; z++) {
                    try {
                        const block = player.dimension.getBlock({
                            x: Math.floor(playerLoc.x) + x,
                            y: Math.floor(playerLoc.y) + y,
                            z: Math.floor(playerLoc.z) + z
                        });
                        
                        if (block && (block.typeId === 'minecraft:chest' || block.typeId === 'minecraft:trapped_chest')) {
                            nearbyBlocks.push(block);
                        }
                    } catch (error) {
                        // Ignore invalid blocks
                    }
                }
            }
        }
        
        if (nearbyBlocks.length > 0) {
            let organized = 0;
            nearbyBlocks.forEach(chest => {
                if (organizeChest(chest)) {
                    organized++;
                }
            });
            
            player.sendMessage(`§a[Organizer] ${organized} chest(s) organized!`);
        } else {
            player.sendMessage('§c[Organizer] No chests found nearby!');
        }
    }
});

console.log('Chest Organizer Add-on loaded successfully!');